import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type InviteMethod = 'email' | 'direct';

export function InviteUserModal({ isOpen, onClose, onSuccess }: InviteUserModalProps) {
  const { user } = useAuth();
  const [method, setMethod] = useState<InviteMethod>('email');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
  };

  const handleEmailInvite = async () => {
    if (!email || !user) return;

    setLoading(true);
    setError(null);

    try {
      // Check if invitation already exists
      const { data: existingInvite, error: inviteCheckError } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', email.toLowerCase())
        .is('accepted_at', null)
        .maybeSingle();

      // Only throw if there's an actual query error (not "no rows found")
      if (inviteCheckError) {
        throw new Error(`Failed to check invitations: ${inviteCheckError.message}`);
      }

      if (existingInvite) {
        throw new Error('An invitation for this email already exists');
      }

      // Check if user already exists
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      // Only throw if there's an actual query error (not "no rows found")
      if (profileCheckError) {
        throw new Error(`Failed to check profiles: ${profileCheckError.message}`);
      }

      if (existingProfile) {
        throw new Error('A user with this email already exists');
      }

      // Create invitation record
      const { error: inviteError } = await supabase
        .from('invitations')
        .insert({
          email: email.toLowerCase(),
          role,
          invited_by: user.id,
        });

      if (inviteError) throw inviteError;

      // Send magic link via Supabase Auth
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;

      setSuccess(`Invitation sent to ${email}. They will receive an email with a link to set up their account.`);
      setEmail('');
      setRole('user');

      // Wait a moment then close
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectCreate = async () => {
    if (!email || !password || !user) return;

    setLoading(true);
    setError(null);

    try {
      // Check if user already exists
      const { data: existingProfile, error: profileCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      // Only throw if there's an actual query error (not "no rows found")
      if (profileCheckError) {
        throw new Error(`Failed to check profiles: ${profileCheckError.message}`);
      }

      if (existingProfile) {
        throw new Error('A user with this email already exists');
      }

      // Create user via Supabase Auth
      // Note: This will only work if email confirmation is disabled in Supabase settings
      // or if you're using a service role key via Edge Function
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Failed to create user account');
      }

      // Update the profile with the correct role (trigger creates it with 'user' by default)
      // We need to wait a moment for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          role, 
          invited_by: user.id,
          first_login: true 
        })
        .eq('id', authData.user.id);

      if (profileError) {
        console.warn('Could not update profile role:', profileError);
        // Try inserting instead if update failed
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: email.toLowerCase(),
            role,
            invited_by: user.id,
            first_login: true
          });

        if (insertError) {
          throw new Error(`Account created but profile setup failed: ${insertError.message}. The user may need to be configured manually.`);
        }
      }

      setCreatedCredentials({ email: email.toLowerCase(), password });
      setSuccess('Account created successfully!');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'email') {
      handleEmailInvite();
    } else {
      handleDirectCreate();
    }
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setRole('user');
    setError(null);
    setSuccess(null);
    setCreatedCredentials(null);
    setMethod('email');
    onClose();
  };

  const copyCredentials = () => {
    if (createdCredentials) {
      navigator.clipboard.writeText(
        `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Add New User</h2>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {createdCredentials ? (
            // Success state with credentials
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-emerald-400 font-medium">Account Created Successfully!</p>
                    <p className="text-slate-400 text-sm mt-1">Share these credentials with the new user:</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 font-mono text-sm">
                <p className="text-slate-400">Email:</p>
                <p className="text-white mb-3">{createdCredentials.email}</p>
                <p className="text-slate-400">Password:</p>
                <p className="text-white">{createdCredentials.password}</p>
              </div>

              <button
                onClick={copyCredentials}
                className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Credentials
              </button>

              <button
                onClick={handleClose}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Method Selection */}
              <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMethod('email')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    method === 'email'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Send Email Invite
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('direct')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    method === 'direct'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Method Description */}
              <p className="text-sm text-slate-400">
                {method === 'email'
                  ? 'Send an email invitation with a magic link. The user will set their own password.'
                  : 'Create an account with a password you set. Share the credentials with the user.'}
              </p>

              {/* Email Input */}
              <div>
                <label htmlFor="invite-email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email Address
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  placeholder="user@example.com"
                />
              </div>

              {/* Password Input (for direct creation) */}
              {method === 'direct' && (
                <div>
                  <label htmlFor="invite-password" className="block text-sm font-medium text-slate-300 mb-2">
                    Temporary Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="invite-password"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent font-mono"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={generatePassword}
                      className="px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
                      title="Generate Password"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  User Role
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('user')}
                    className={`flex-1 py-3 px-4 rounded-xl border transition-colors ${
                      role === 'user'
                        ? 'bg-slate-700/50 border-sky-500 text-white'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span className="font-medium">User</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Standard access</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`flex-1 py-3 px-4 rounded-xl border transition-colors ${
                      role === 'admin'
                        ? 'bg-purple-500/10 border-purple-500 text-white'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="font-medium">Admin</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Full access</p>
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && !createdCredentials && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
                  {success}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !email || (method === 'direct' && !password)}
                className="w-full py-3 px-4 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-semibold rounded-xl shadow-lg shadow-sky-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {method === 'email' ? 'Sending Invitation...' : 'Creating Account...'}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={method === 'email' ? 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' : 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z'} />
                    </svg>
                    {method === 'email' ? 'Send Invitation' : 'Create Account'}
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
