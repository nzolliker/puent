import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { useSetPassword } from '@/lib/auth'
import { setPasswordFormSchema } from '@server/sharedTypes'

type SetupSearch = { token?: string }

export const Route = createFileRoute('/setup')({
    component: Setup,
    // Same shape as the date parameter on /waterPlants: a link that arrives
    // without a usable token should render an explanation, not crash.
    validateSearch: (search: Record<string, unknown>): SetupSearch =>
        typeof search.token === 'string' ? { token: search.token } : {},
})

function FieldInfo({ field }: { field: AnyFieldApi }) {
    const error = field.state.meta.errors[0]
    if (!field.state.meta.isTouched || !error) {
        return null
    }

    return (
        <p className="text-sm text-destructive">
            {typeof error === 'object' ? error.message : String(error)}
        </p>
    )
}

async function checkToken(token: string) {
    const response = await api.auth.setup.check.$post({ json: { token } })
    if (!response.ok) {
        throw new Error('Dieser Link ist ungültig oder abgelaufen.')
    }
    const data = await response.json()
    return data.account
}

function SetupCard({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto max-w-sm p-4">{children}</div>
}

function Setup() {
    const { token } = Route.useSearch()
    const navigate = useNavigate()
    const setPassword = useSetPassword()

    const {
        data: account,
        isPending,
        error,
    } = useQuery({
        queryKey: ['setup-token', token],
        queryFn: () => checkToken(token!),
        enabled: Boolean(token),
        retry: false,
    })

    const form = useForm({
        defaultValues: { password: '', confirmation: '' },
        validators: { onChange: setPasswordFormSchema },
        onSubmit: async ({ value }) => {
            await setPassword.mutateAsync({ token: token!, password: value.password })
            await navigate({ to: '/' })
        },
    })

    if (!token || error) {
        return (
            <SetupCard>
                <Card>
                    <CardHeader>
                        <CardTitle>Link ungültig</CardTitle>
                        <CardDescription>
                            Dieser Link ist abgelaufen oder wurde schon benutzt. Die
                            Gartengruppe kann einen neuen verschicken.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link to="/login" className="underline underline-offset-2">
                            Zur Anmeldung
                        </Link>
                    </CardContent>
                </Card>
            </SetupCard>
        )
    }

    return (
        <SetupCard>
            <Card>
                <CardHeader>
                    <CardTitle>
                        {isPending ? <Skeleton className="h-6 w-40" /> : `Hallo ${account?.name}`}
                    </CardTitle>
                    <CardDescription>
                        Wähle ein Passwort. Danach bist du direkt angemeldet.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid gap-4"
                        onSubmit={(event) => {
                            event.preventDefault()
                            // The mutation's error is rendered below the fields, so
                            // catching here only stops a wrong password from also
                            // becoming an unhandled rejection in the console.
                            void form.handleSubmit().catch(() => {})
                        }}
                    >
                        {/* Password managers key on this, so the username is in the
                            form even though the token already identifies the account. */}
                        <input
                            type="text"
                            name="username"
                            autoComplete="username"
                            value={account?.username ?? ''}
                            readOnly
                            hidden
                        />
                        <form.Field
                            name="password"
                            children={(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>Passwort</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        type="password"
                                        autoComplete="new-password"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                    />
                                    <FieldInfo field={field} />
                                </div>
                            )}
                        />
                        <form.Field
                            name="confirmation"
                            children={(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>Passwort wiederholen</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        type="password"
                                        autoComplete="new-password"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                    />
                                    <FieldInfo field={field} />
                                </div>
                            )}
                        />

                        {setPassword.error ? (
                            <p className="text-sm text-destructive">
                                {setPassword.error.message}
                            </p>
                        ) : null}

                        <form.Subscribe
                            selector={(state) =>
                                [
                                    state.canSubmit,
                                    state.isSubmitting,
                                    state.values.password.length > 0,
                                ] as const
                            }
                            children={([canSubmit, isSubmitting, isFilled]) => (
                                <Button
                                    type="submit"
                                    disabled={!canSubmit || !isFilled || isSubmitting || isPending}
                                >
                                    {isSubmitting ? '...' : 'Passwort speichern'}
                                </Button>
                            )}
                        />
                    </form>
                </CardContent>
            </Card>
        </SetupCard>
    )
}
