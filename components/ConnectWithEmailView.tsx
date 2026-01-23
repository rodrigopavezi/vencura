"use client";
import { FormEventHandler, useState, useEffect } from 'react';
import { useConnectWithOtp, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSyncUser } from '@/hooks/useSyncUser';

export default function ConnectWithEmailView() {
    const { user } = useDynamicContext();
    const { connectWithEmail, verifyOneTimePassword } = useConnectWithOtp();
    const { isSyncing, dbUser } = useSyncUser();
    const router = useRouter();
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Redirect to dashboard when user is authenticated and synced
    useEffect(() => {
        if (user && !isSyncing) {
            router.push('/dashboard');
        }
    }, [user, isSyncing, router]);

    const onSubmitEmailHandler: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        try {
            await connectWithEmail(email);
            setOtp(''); // Clear OTP field when moving to OTP step
            setStep('otp');
        } finally {
            setIsLoading(false);
        }
    };

    const onSubmitOtpHandler: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        try {
            await verifyOneTimePassword(otp);
        } finally {
            setIsLoading(false);
        }
    };

    // Prevent hydration mismatch by showing loading state until mounted
    if (!mounted) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Loading...</CardTitle>
                    <CardDescription>Please wait</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-32 flex items-center justify-center">
                        <div className="animate-pulse text-muted-foreground">Loading...</div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (user) {
        return (
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Welcome{dbUser?.name ? `, ${dbUser.name}` : ''}!</CardTitle>
                    <CardDescription>
                        {isSyncing ? 'Syncing your account...' : 'Redirecting to dashboard...'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-8">
                    <div className="animate-pulse text-muted-foreground">
                        {isSyncing ? 'Setting up your account...' : 'Loading dashboard...'}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>Sign In</CardTitle>
                <CardDescription>
                    {step === 'email'
                        ? 'Enter your email to receive a one-time password'
                        : `Enter the code sent to ${email}`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {step === 'email' ? (
                    <form onSubmit={onSubmitEmailHandler} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                placeholder="you@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                                disabled={isLoading}
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? 'Sending...' : 'Continue'}
                        </Button>
                    </form>
                ) : (
                    <form onSubmit={onSubmitOtpHandler} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="otp">Verification Code</Label>
                            <Input
                                id="otp"
                                name="otp"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Enter code"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                autoComplete="one-time-code"
                                required
                                disabled={isLoading}
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1"
                                onClick={() => setStep('email')}
                                disabled={isLoading}
                            >
                                Back
                            </Button>
                            <Button type="submit" className="flex-1" disabled={isLoading}>
                                {isLoading ? 'Verifying...' : 'Verify'}
                            </Button>
                        </div>
                    </form>
                )}
            </CardContent>
        </Card>
    );
}