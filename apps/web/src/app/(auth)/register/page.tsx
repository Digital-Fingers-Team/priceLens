'use client';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useRegister } from '@/lib/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const registerSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  username: z
    .string()
    .min(3, 'At least 3 characters')
    .max(32, 'Max 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers and underscores only'),
  displayName: z.string().max(64).optional(),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[a-zA-Z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { mutate: register_, isPending } = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  function onSubmit(data: RegisterForm) {
    register_(data);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-ink-50">Create your account</h1>
        <p className="text-sm text-ink-500">Track prices and get alerts when deals drop</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          leftIcon={<Mail className="w-4 h-4" />}
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Username"
          placeholder="john_doe"
          autoComplete="username"
          leftIcon={<User className="w-4 h-4" />}
          hint="Letters, numbers, and underscores only"
          error={errors.username?.message}
          {...register('username')}
        />

        <Input
          label="Display name (optional)"
          placeholder="John Doe"
          leftIcon={<User className="w-4 h-4" />}
          error={errors.displayName?.message}
          {...register('displayName')}
        />

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="8+ characters, letter and number"
          autoComplete="new-password"
          leftIcon={<Lock className="w-4 h-4" />}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-ink-500 hover:text-ink-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirm password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Repeat your password"
          autoComplete="new-password"
          leftIcon={<Lock className="w-4 h-4" />}
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isPending}
          className="w-full mt-2"
        >
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-ink-500">
        Already have an account?{' '}
        <Link href="/login" className="text-signal hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}
