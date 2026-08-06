import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { errorMessage } from '@/api/errors';
import logo from '@/assets/inside_app_logo.png';
import { useAuth } from '@/auth/auth-context';
import { EnvironmentBadge } from '@/components/environment-badge';

const FIELD_CLASSES =
  'w-full min-h-[52px] rounded-[10px] bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.08)] ' +
  'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/40';

const loginSchema = z.object({
  email: z.string().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const auth = useAuth();
  const router = useRouter();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  });

  const signIn = useMutation({
    mutationFn: (values: LoginValues) => auth.login(values.email, values.password),
    onSuccess: async () => {
      // beforeLoad results are cached and `auth` is a stable object, so the
      // guard would otherwise still believe there is no session. Invalidate
      // before navigating or the redirect bounces straight back to /login.
      await router.invalidate();
      await navigate({ to: redirectTo });
    },
  });

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5">
        <header className="flex flex-col items-center gap-4 pt-12">
          <img src={logo} alt="SurgiSync logo" className="h-[60px]" />
          <EnvironmentBadge />
        </header>

        <form
          onSubmit={(event) => void handleSubmit((values) => signIn.mutate(values))(event)}
          className="mt-[12vh] flex flex-col gap-3"
          noValidate
        >
          <h1 className="mb-2 text-2xl font-medium text-gray-900">Login to your Account</h1>

          <div>
            <input
              {...register('email')}
              type="email"
              placeholder="Email address"
              autoComplete="username"
              autoCapitalize="none"
              aria-invalid={Boolean(errors.email)}
              className={FIELD_CLASSES}
            />
            {errors.email && <p className="mt-1 text-sm text-error">{errors.email.message}</p>}
          </div>

          <div>
            <div className="relative">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                className={`${FIELD_CLASSES} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-4 text-gray-400 hover:text-gray-600"
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-sm text-error">{errors.password.message}</p>
            )}
          </div>

          {signIn.isError && (
            <p role="alert" className="text-sm text-error">
              {errorMessage(signIn.error)}
            </p>
          )}

          <button
            type="submit"
            disabled={signIn.isPending || !isValid}
            className="mt-14 flex min-h-[50px] w-full items-center justify-center rounded-full
                       bg-brand font-semibold text-white transition
                       hover:bg-brand-dark disabled:pointer-events-none disabled:opacity-60"
          >
            {signIn.isPending ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
                role="status"
                aria-label="Signing in"
              />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* The spike had "Forgot Password?" and "Sign up" buttons with no
            handlers. A dead control in the exemplar screen gets copied into
            every later one, so they are omitted until the flows exist. */}
        <footer className="mt-auto pb-8 pt-12" />
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7c2.2 0 4.1.8 5.6 1.9M22 12s-3.5 7-10 7c-2.2 0-4.1-.8-5.6-1.9" />
          <path d="m3 3 18 18" />
        </>
      )}
    </svg>
  );
}
