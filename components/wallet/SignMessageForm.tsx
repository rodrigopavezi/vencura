"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { PenTool, Loader2, Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SignMessageFormProps {
  walletId: string;
  disabled?: boolean;
}

export function SignMessageForm({ walletId, disabled }: SignMessageFormProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const signMessage = trpc.wallet.signMessage.useMutation({
    onSuccess: (result) => {
      setSignature(result.signature);
      toast.success("Message signed successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sign message");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      toast.error("Please enter a message to sign");
      return;
    }

    signMessage.mutate({
      walletId,
      message: message.trim(),
    });
  };

  const copySignature = () => {
    if (signature) {
      navigator.clipboard.writeText(signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setMessage("");
    setSignature(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <PenTool className="mr-2 h-4 w-4" />
          Sign Message
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Sign Message</DialogTitle>
            <DialogDescription>
              Sign a message with your wallet. This can be used for authentication or verification.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Enter the message to sign..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={signMessage.isPending || !!signature}
                rows={4}
              />
            </div>

            {signature && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label>Signature</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copySignature}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="font-mono text-xs break-all bg-muted p-3 rounded">
                    {signature}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {signature ? "Close" : "Cancel"}
            </Button>
            {!signature && (
              <Button type="submit" disabled={signMessage.isPending}>
                {signMessage.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Sign Message
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
