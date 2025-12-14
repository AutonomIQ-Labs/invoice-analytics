import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { InvitationWithInviter } from '../../types/database';

interface PendingInvitationsProps {
  onRefresh: () => void;
}

export function PendingInvitations({ onRefresh }: PendingInvitationsProps) {
  const [invitations, setInvitations] = useState<InvitationWithInviter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch pending invitations (not yet accepted)
      const { data, error } = await supabase
        .from('invitations')
        .select(`
          *,
          inviter:invited_by(email, display_name)
        `)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleResendInvite = async (invitation: InvitationWithInviter) => {
    setActionId(invitation.id);
    setError(null);

    try {
      // Send magic link again
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: invitation.email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) throw authError;

      // Update invitation timestamp
      const { error: updateError } = await supabase
        .from('invitations')
        .update({ 
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() 
        })
        .eq('id', invitation.id);

      if (updateError) throw updateError;

      await fetchInvitations();
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    } finally {
      setActionId(null);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    setActionId(invitationId);
    setError(null);

    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      setInvitations(invitations.filter(i => i.id !== invitationId));
      setDeleteConfirmId(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setActionId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h remaining`;
    return 'Less than 1h remaining';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Pending Invitations</h3>
          <p className="text-sm text-slate-400">
            Invitations that haven't been accepted yet
          </p>
        </div>
        <button
          onClick={fetchInvitations}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title="Refresh"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {invitations.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-12 h-12 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-400">No pending invitations</p>
          <p className="text-sm text-slate-500 mt-1">
            Invitations you send will appear here until they're accepted
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((invitation) => {
            const expired = isExpired(invitation.expires_at);
            const isProcessing = actionId === invitation.id;

            return (
              <div
                key={invitation.id}
                className={`p-4 rounded-xl border transition-colors ${
                  expired
                    ? 'bg-slate-800/30 border-slate-700/50'
                    : 'bg-slate-800/50 border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      expired ? 'bg-slate-700' : 'bg-gradient-to-br from-amber-500 to-orange-500'
                    }`}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-medium ${expired ? 'text-slate-500' : 'text-white'}`}>
                        {invitation.email}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          invitation.role === 'admin'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-slate-500/20 text-slate-400'
                        }`}>
                          {invitation.role === 'admin' ? 'Administrator' : 'User'}
                        </span>
                        <span className={`text-xs ${expired ? 'text-red-400' : 'text-slate-500'}`}>
                          {getTimeRemaining(invitation.expires_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Invited on {formatDate(invitation.created_at)}
                        {invitation.inviter && (
                          <> by {invitation.inviter.display_name || invitation.inviter.email}</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Resend Button */}
                    <button
                      onClick={() => handleResendInvite(invitation)}
                      disabled={isProcessing}
                      className="p-2 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Resend Invitation"
                    >
                      {isProcessing ? (
                        <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </button>

                    {/* Revoke Button */}
                    {deleteConfirmId === invitation.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRevokeInvite(invitation.id)}
                          disabled={isProcessing}
                          className="px-2 py-1 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(invitation.id)}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Revoke Invitation"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Summary */}
      {invitations.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-700/50">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{invitations.length}</p>
              <p className="text-xs text-slate-400">Total Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">
                {invitations.filter(i => !isExpired(i.expires_at)).length}
              </p>
              <p className="text-xs text-slate-400">Active</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">
                {invitations.filter(i => isExpired(i.expires_at)).length}
              </p>
              <p className="text-xs text-slate-400">Expired</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
