'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '../../../lib/api';
import { getToken } from '../../../lib/auth';

function Input(props) {
    return (
        <input
            {...props}
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/20 ${props.className || ''}`}
        />
    );
}

function Button({ children, variant = 'primary', ...props }) {
    const baseClass = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60';
    const variantClass =
        variant === 'primary'
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : variant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'border text-gray-700 hover:bg-gray-50';
    return (
        <button {...props} className={`${baseClass} ${variantClass} ${props.className || ''}`}>
            {children}
        </button>
    );
}

function StatusBadge({ status }) {
    const colors = {
        joined: 'bg-green-100 text-green-800',
        pending: 'bg-yellow-100 text-yellow-800',
        joining: 'bg-blue-100 text-blue-800',
        failed: 'bg-red-100 text-red-800',
    };
    return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    );
}

export default function GroupsPage() {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Form state
    const [groupName, setGroupName] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [creating, setCreating] = useState(false);

    // Groups list
    const [groups, setGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // Selected group for join
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [eligibleSessions, setEligibleSessions] = useState([]);
    const [selectedSessions, setSelectedSessions] = useState([]);
    const [joining, setJoining] = useState(false);

    // Join status modal
    const [showJoins, setShowJoins] = useState(null);
    const [joins, setJoins] = useState([]);
    const [loadingJoins, setLoadingJoins] = useState(false);

    const apiBase = useMemo(() => getApiBaseUrl(), []);

    // Load groups on mount
    async function loadGroups() {
        setLoadingGroups(true);
        setError('');
        try {
            const data = await apiFetch('/groups', { token: getToken() });
            setGroups(data.groups || []);
        } catch (e) {
            setError(e?.message || 'Gagal memuat groups');
        } finally {
            setLoadingGroups(false);
        }
    }

    // Load eligible sessions
    async function loadEligibleSessions() {
        try {
            const data = await apiFetch('/groups/eligible-sessions', { token: getToken() });
            setEligibleSessions(data.eligibleSessions || []);
        } catch (e) {
            console.error('Failed to load eligible sessions:', e);
        }
    }

    useEffect(() => {
        loadGroups();
        loadEligibleSessions();
    }, []);

    // Create group
    async function handleCreateGroup(e) {
        e.preventDefault();
        setCreating(true);
        setError('');
        try {
            await apiFetch('/groups', {
                token: getToken(),
                method: 'POST',
                body: { name: groupName, inviteLink },
            });
            setGroupName('');
            setInviteLink('');
            await loadGroups();
        } catch (e) {
            setError(e?.message || 'Gagal membuat group');
        } finally {
            setCreating(false);
        }
    }

    // Delete group
    async function handleDeleteGroup(id) {
        if (!confirm('Hapus group ini?')) return;
        setError('');
        try {
            await apiFetch(`/groups/${id}`, { token: getToken(), method: 'DELETE' });
            await loadGroups();
        } catch (e) {
            setError(e?.message || 'Gagal menghapus group');
        }
    }

    // Load joins for a group
    async function loadJoins(groupId) {
        setLoadingJoins(true);
        try {
            const data = await apiFetch(`/groups/${groupId}/joins`, { token: getToken() });
            setJoins(data.joins || []);
        } catch (e) {
            console.error('Failed to load joins:', e);
        } finally {
            setLoadingJoins(false);
        }
    }

    // Open join modal
    function openJoinModal(groupId) {
        setSelectedGroupId(groupId);
        setSelectedSessions([]);
        loadEligibleSessions();
    }

    // Toggle session selection
    function toggleSession(session) {
        setSelectedSessions((prev) => {
            const key = `${session.sessionName}:${session.chatId}`;
            const exists = prev.some((s) => `${s.sessionName}:${s.chatId}` === key);
            if (exists) {
                return prev.filter((s) => `${s.sessionName}:${s.chatId}` !== key);
            }
            return [...prev, session];
        });
    }

    // Trigger join
    async function handleTriggerJoin() {
        if (selectedSessions.length === 0) return;
        setJoining(true);
        setError('');
        try {
            const data = await apiFetch(`/groups/${selectedGroupId}/join`, {
                token: getToken(),
                method: 'POST',
                body: { sessions: selectedSessions },
            });
            alert(`Join dimulai: ${data.queued} sessions (${data.skippedAlreadyJoined} skipped)`);
            setSelectedGroupId(null);
            setSelectedSessions([]);
            await loadGroups();
        } catch (e) {
            setError(e?.message || 'Gagal memulai join');
        } finally {
            setJoining(false);
        }
    }

    // Retry failed joins
    async function handleRetry(groupId) {
        setError('');
        try {
            const data = await apiFetch(`/groups/${groupId}/retry`, { token: getToken(), method: 'POST' });
            alert(`Retry dimulai: ${data.retriedCount} sessions`);
            await loadGroups();
        } catch (e) {
            setError(e?.message || 'Gagal retry');
        }
    }

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border bg-white p-5">
                <h1 className="text-xl font-semibold">Groups</h1>
                <p className="mt-1 text-sm text-gray-600">
                    Masukkan nomor NEW ke WhatsApp group via invitation link.
                </p>
            </div>

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Create Group Form */}
                <section className="rounded-2xl border bg-white p-5">
                    <h2 className="text-base font-semibold">Tambah Group Baru</h2>
                    <form onSubmit={handleCreateGroup} className="mt-4 space-y-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Nama Group</label>
                            <Input
                                value={groupName}
                                onChange={(e) => setGroupName(e.target.value)}
                                placeholder="Contoh: Group Marketing"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Invitation Link</label>
                            <Input
                                value={inviteLink}
                                onChange={(e) => setInviteLink(e.target.value)}
                                placeholder="https://chat.whatsapp.com/xxx"
                                required
                            />
                        </div>
                        <Button type="submit" disabled={creating}>
                            {creating ? 'Menyimpan...' : 'Tambah Group'}
                        </Button>
                    </form>
                </section>

                {/* Groups List */}
                <section className="rounded-2xl border bg-white p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold">Daftar Groups</h2>
                        <button onClick={loadGroups} className="rounded-lg border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            Refresh
                        </button>
                    </div>

                    {loadingGroups ? <div className="mt-4 text-sm text-gray-600">Loading...</div> : null}

                    <div className="mt-4 space-y-3">
                        {groups.map((g) => (
                            <div key={g.id} className="rounded-xl border p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-gray-900">{g.name}</div>
                                        <div className="mt-1 text-xs text-gray-500 break-all">{g.inviteLink}</div>
                                        <div className="mt-2 flex gap-2 text-xs">
                                            <span className="text-green-600">✓ {g.stats?.joined || 0} joined</span>
                                            <span className="text-yellow-600">⏳ {g.stats?.pending || 0} pending</span>
                                            <span className="text-red-600">✗ {g.stats?.failed || 0} failed</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="secondary" onClick={() => openJoinModal(g.id)}>
                                            Join
                                        </Button>
                                        <Button
                                            variant="secondary"
                                            onClick={() => {
                                                setShowJoins(g.id);
                                                loadJoins(g.id);
                                            }}
                                        >
                                            Status
                                        </Button>
                                        {(g.stats?.failed || 0) > 0 && (
                                            <Button variant="secondary" onClick={() => handleRetry(g.id)}>
                                                Retry
                                            </Button>
                                        )}
                                        <Button variant="danger" onClick={() => handleDeleteGroup(g.id)}>
                                            Hapus
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {groups.length === 0 && !loadingGroups ? (
                            <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700">Belum ada group.</div>
                        ) : null}
                    </div>
                </section>
            </div>

            {/* Join Modal */}
            {selectedGroupId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-6">
                        <h3 className="text-lg font-semibold">Pilih Sessions untuk Join</h3>
                        <p className="mt-1 text-sm text-gray-600">
                            Semua session NEW dapat dipilih untuk join group.
                        </p>

                        <div className="mt-4 max-h-64 overflow-y-auto space-y-2">
                            {eligibleSessions.length === 0 ? (
                                <div className="text-sm text-gray-500">Tidak ada session NEW. Tambahkan session cluster NEW terlebih dahulu di halaman Sessions.</div>
                            ) : (
                                eligibleSessions.map((s) => {
                                    const key = `${s.sessionName}:${s.chatId}`;
                                    const isSelected = selectedSessions.some((sel) => `${sel.sessionName}:${sel.chatId}` === key);
                                    return (
                                        <label
                                            key={key}
                                            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50 ${isSelected ? 'border-gray-900 bg-gray-50' : ''}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSession(s)}
                                                className="h-4 w-4"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium">{s.sessionName}</div>
                                            </div>
                                        </label>
                                    );
                                })
                            )}
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setSelectedGroupId(null)}>
                                Batal
                            </Button>
                            <Button onClick={handleTriggerJoin} disabled={joining || selectedSessions.length === 0}>
                                {joining ? 'Memproses...' : `Join ${selectedSessions.length} Session`}
                            </Button>
                        </div>
                    </div>
                </div>
            )
            }

            {/* Status Modal */}
            {
                showJoins && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                        <div className="w-full max-w-lg rounded-2xl bg-white p-6">
                            <h3 className="text-lg font-semibold">Status Join</h3>

                            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
                                {loadingJoins ? (
                                    <div className="text-sm text-gray-500">Loading...</div>
                                ) : joins.length === 0 ? (
                                    <div className="text-sm text-gray-500">Belum ada join untuk group ini.</div>
                                ) : (
                                    joins.map((j) => (
                                        <div key={j.id} className="flex items-center justify-between rounded-lg border p-3">
                                            <div>
                                                <div className="text-sm font-medium">{j.sessionName}</div>
                                                <div className="text-xs text-gray-500">{j.chatId}</div>
                                                {j.errorMessage && <div className="text-xs text-red-500 mt-1">{j.errorMessage}</div>}
                                            </div>
                                            <StatusBadge status={j.status} />
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="mt-6 flex justify-end">
                                <Button variant="secondary" onClick={() => setShowJoins(null)}>
                                    Tutup
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
