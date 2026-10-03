'use client';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRegister } from '@/lib/hooks/use-auth';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { PasswordToggle } from '../password-toggle';

export default function RegisterPage() {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const { mutate: register_, isPending } = useRegister();

  const schema = useMemo(
    () =>
      z
        .object({
          email: z.string().email(t.auth.emailInvalid),
          username: z
            .string()
            .min(3, t.auth.usernameMin)
            .max(32, t.auth.usernameMax)
            .regex(/^[a-zA-Z0-9_]+$/, t.auth.usernameChars),
          displayName: z.string().max(64).optional(),
          password: z
            .string()
            .min(8, t.auth.passwordMin)
            .regex(/[a-zA-Z]/, t.auth.passwordLetter)
            .regex(/[0-9]/, t.auth.passwordNumber),
          confirmPassword: z.string(),
        })
        .refine((d) => d.password === d.confirmPassword, {
          message: t.auth.passwordMismatch,
          path: ['confirmPassword'],
        }),
    [t],
  );
  type RegisterForm = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(schema) });

  function onSubmit(data: RegisterForm) {
    // confirmPassword is a client-side-only field; the API rejects unknown
    // properties (forbidNonWhitelisted), so it must not be sent.
    const { confirmPassword: _confirmPassword, displayName, ...rest } = data;
    void _confirmPassword;
    register_({
      ...rest,
      // an untouched optional input yields '', which fails the API's IsString/MaxLength
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-fg">{t.auth.registerTitle}</h1>
        <p className="text-sm text-muted">{t.auth.registerLede}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Input
          label={t.auth.email}
          type="email"
          placeholder={t.auth.emailPlaceholder}
          autoComplete="email"
          dir="ltr"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label={t.auth.username}
          autoComplete="username"
          dir="ltr"
          hint={t.auth.usernameChars}
          error={errors.username?.message}
          {...register('username')}
        />
        <Input
          label={`${t.auth.displayName} (${t.common.optional})`}
          dir="auto"
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <Input
          label={t.auth.password}
          type={showPassword ? 'text' : 'password'}
          placeholder={t.auth.passwordPlaceholder}
          autoComplete="new-password"
          rightElement={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label={t.auth.confirmPassword}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" size="lg" loading={isPending} className="w-full">
          {t.auth.createAccount}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {t.auth.haveAccount}{' '}
        <Link href="/login" className="font-medium text-brand-text hover:underline">
          {t.common.signIn}
        </Link>
      </p>
    </div>
  );
}
