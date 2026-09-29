import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import type { AnyFieldApi } from '@tanstack/react-form'

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
import { useLogin, useSession } from '@/lib/auth'
import { loginSchema } from '@server/sharedTypes'

export const Route = createFileRoute('/login')({
    component: Login,
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

function Login() {
    const navigate = useNavigate()
    const { user } = useSession()
    const login = useLogin()

    const form = useForm({
        defaultValues: { username: '', password: '' },
        validators: { onChange: loginSchema },
        onSubmit: async ({ value }) => {
            await login.mutateAsync(value)
            await navigate({ to: '/' })
        },
    })

    if (user) {
        return (
            <div className="mx-auto max-w-sm p-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Bereits angemeldet</CardTitle>
                        <CardDescription>Angemeldet als {user.name}.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link to="/" className="underline underline-offset-2">
                            Zur Übersicht
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-sm p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Anmelden</CardTitle>
                    <CardDescription>
                        Zum Eintragen von Giesstagen, Ausgaben und Fotos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* A real form element, so Enter submits -- this is the one
                        screen where a phone keyboard offers a "go" key. */}
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
                        <form.Field
                            name="username"
                            children={(field) => (
                                <div className="grid gap-2">
                                    <Label htmlFor={field.name}>Benutzername</Label>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        autoComplete="username"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                    />
                                    <FieldInfo field={field} />
                                </div>
                            )}
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
                                        autoComplete="current-password"
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                    />
                                    <FieldInfo field={field} />
                                </div>
                            )}
                        />

                        {login.error ? (
                            <p className="text-sm text-destructive">{login.error.message}</p>
                        ) : null}

                        <form.Subscribe
                            selector={(state) => [state.canSubmit, state.isSubmitting] as const}
                            children={([canSubmit, isSubmitting]) => (
                                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                                    {isSubmitting ? '...' : 'Anmelden'}
                                </Button>
                            )}
                        />
                    </form>

                    <p className="mt-4 text-xs text-muted-foreground">
                        Kein Konto? Die Gartengruppe verschickt einen einmaligen Link.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
