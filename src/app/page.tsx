'use client';

import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const inApp = await sdk.isInMiniApp();
        setIsInMiniApp(inApp);

        if (inApp) {
          const context = await sdk.context;
          if (context?.user) {
            setUser(context.user);
          }
        }
      } catch (error) {
        console.error('Failed to get context:', error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const handleSignIn = async () => {
    try {
      // Generate a random nonce for the sign in request
      const nonce = Math.random().toString(36).substring(7);
      
      await sdk.actions.signIn({ nonce });
      
      // After sign in, try to get the updated context
      const context = await sdk.context;
      if (context?.user) {
        setUser(context.user);
      }
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleComposeCast = async () => {
    try {
      await sdk.actions.composeCast({
        text: 'Check out this awesome Farcaster Mini App! 🚀',
        embeds: [window.location.href],
      });
    } catch (error) {
      console.error('Failed to compose cast:', error);
    }
  };

  const handleViewProfile = async (fid: number) => {
    try {
      await sdk.actions.viewProfile({ fid });
    } catch (error) {
      console.error('Failed to view profile:', error);
    }
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await sdk.actions.openUrl(url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  const handleAddMiniApp = async () => {
    try {
      await sdk.actions.addMiniApp();
    } catch (error) {
      console.error('Failed to add mini app:', error);
    }
  };

  const copyToClipboard = async (text: string, commandType: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(commandType);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-8">
      {/* Hero Section */}
      <section className="text-center space-y-4">
        <h1 className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent leading-tight">
          chat using 0g blockchain+filecoin
        </h1>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          chat with 0g decentrally ai and save the data using filecoin decentralized storage
        </p>
      </section>


      {/* User Info Card */}
      {user ? (
        <div className="max-w-md mx-auto">
          <div className="bg-card rounded-lg shadow-lg p-6 space-y-4">
            <div className="flex items-center space-x-4">
              {user.pfpUrl && (
                <img
                  src={user.pfpUrl}
                  alt={user.displayName || user.username}
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div>
                <h2 className="text-xl font-bold">{user.displayName || user.username}</h2>
                <p className="text-muted-foreground">@{user.username}</p>
                <p className="text-sm text-muted-foreground">FID: {user.fid}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <button
            onClick={() => window.location.href = '/chat'}
            className="btn-primary px-8 py-3 text-lg"
          >
            chat now
          </button>
        </div>
      )}


    </div>
  );
}