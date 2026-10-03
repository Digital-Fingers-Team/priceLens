'use client';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLogin } from '@/lib/hooks/use-auth';
import { Link } from '@/lib/i18n/navigation';
import { useI18n } from '@/lib/i18n/provider';
import { PasswordToggle } from '../password-toggle';

export default function LoginPage() {
  const { t } = useI18n();
  const [showPassword, setShowPassword] = useState(false);
  const { mutate: login, isPending } = useLogin();

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t.auth.emailInvalid),
        password: z.string().min(1, t.auth.passwordRequired),
      }),
    [t],
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-fg">{t.auth.loginTitle}</h1>
        <p className="text-sm text-muted">{t.auth.loginLede}</p>
      </div>

      <form onSubmit={handleSubmit((data) => login(data))} className="flex flex-col gap-4">
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
          label={t.auth.password}
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          rightElement={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={isPending} className="w-full">
          {t.common.signIn}
        </Button>
      </form>

      <p className="text-center text-sm text-muted">
        {t.auth.noAccount}{' '}
        <Link href="/register" className="font-medium text-brand-text hover:underline">
          {t.auth.createFree}
        </Link>
      </p>
    </div>
  );
}
