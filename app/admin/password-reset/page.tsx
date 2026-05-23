'use client'

import { useState } from 'react'

type PasswordResetRequest = {
  id: string
  login_id: string
  nickname?: string | null
  status: string
  requested_at: string
  processed_at?: string | null
  memo?: string | null
}

export default function PasswordResetAdminPage() {
  const [adminPin, setAdminPin] = useState('')
  const [requests, setRequests] = useState<PasswordResetRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<PasswordResetRequest | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadRequests() {
    if (!adminPin.trim()) {
      alert('관리자 PIN을 입력해주세요.')
      return
    }

    setLoading(true)

    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'list',
        adminPin,
      }),
    })

    const result = await response.json()
    setLoading(false)

    if (!response.ok) {
      alert(result.error || '요청 목록을 불러오지 못했습니다.')
      return
    }

    setRequests(result.requests ?? [])
  }

  async function resetPassword() {
    if (!selectedRequest) {
      alert('초기화 요청을 선택해주세요.')
      return
    }

    if (!temporaryPassword.trim()) {
      alert('임시 비밀번호를 입력해주세요.')
      return
    }

    if (temporaryPassword.length < 6) {
      alert('임시 비밀번호는 6자 이상이어야 합니다.')
      return
    }

    setLoading(true)

    const response = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reset',
        adminPin,
        requestId: selectedRequest.id,
        loginId: selectedRequest.login_id,
        temporaryPassword,
      }),
    })

    const result = await response.json()
    setLoading(false)

    if (!response.ok) {
      alert(result.error || '비밀번호 초기화에 실패했습니다.')
      return
    }

    alert(`${selectedRequest.nickname || selectedRequest.login_id}님의 비밀번호를 초기화했습니다.`)
    setSelectedRequest(null)
    setTemporaryPassword('')
    loadRequests()
  }

  const pendingRequests = requests.filter((item) => item.status === 'pending')
  const doneRequests = requests.filter((item) => item.status !== 'pending')

  return (
    <main className="min-h-screen bg-[#f8f5f1] px-8 py-8 text-[#252525]">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] font-extrabold text-[#c85b70]">
              iXSO Admin
            </p>
            <h1 className="mt-1 text-[34px] font-black">비밀번호 초기화</h1>
          </div>
          <a
            href="/"
            className="rounded-2xl bg-[#252525] px-5 py-3 text-sm font-extrabold text-white"
          >
            메인으로
          </a>
        </div>

        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-lg font-extrabold">관리자 인증</p>
          <div className="mt-4 flex gap-3">
            <input
              value={adminPin}
              onChange={(event) => setAdminPin(event.target.value)}
              type="password"
              placeholder="관리자 PIN"
              className="w-full rounded-2xl border border-[#ddd6d0] px-4 py-3 outline-none focus:border-[#c85b70]"
            />
            <button
              type="button"
              onClick={loadRequests}
              disabled={loading}
              className="shrink-0 rounded-2xl bg-[#c85b70] px-6 py-3 font-extrabold text-white disabled:opacity-60"
            >
              {loading ? '불러오는 중...' : '요청 불러오기'}
            </button>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-[420px_1fr] gap-6">
          <section className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-lg font-extrabold">대기 중인 요청</p>
              <button
                type="button"
                onClick={loadRequests}
                className="rounded-xl bg-[#f1efec] px-3 py-2 text-xs font-extrabold text-[#555]"
              >
                새로고침
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {pendingRequests.map((request) => (
                <button
                  type="button"
                  key={request.id}
                  onClick={() => setSelectedRequest(request)}
                  className={
                    selectedRequest?.id === request.id
                      ? 'w-full rounded-2xl bg-[#c85b70] px-4 py-3 text-left font-extrabold text-white'
                      : 'w-full rounded-2xl bg-[#f7f5f2] px-4 py-3 text-left font-extrabold text-[#555]'
                  }
                >
                  {request.nickname || '닉네임 없음'}
                  <span className="block text-xs font-bold opacity-70">
                    {request.login_id} · {new Date(request.requested_at).toLocaleString('ko-KR')}
                  </span>
                </button>
              ))}

              {pendingRequests.length === 0 && (
                <p className="rounded-2xl bg-[#f7f5f2] py-8 text-center text-sm font-bold text-[#999]">
                  대기 중인 요청이 없습니다.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-xl font-extrabold">임시 비밀번호 설정</p>
            <p className="mt-1 text-sm font-bold text-[#777]">
              선택한 회원의 비밀번호를 임시 비밀번호로 변경합니다.
            </p>

            {selectedRequest ? (
              <div className="mt-6 max-w-xl">
                <p className="text-sm font-bold text-[#777]">선택 요청</p>
                <p className="mt-1 text-2xl font-extrabold">
                  {selectedRequest.nickname || '닉네임 없음'}
                </p>
                <p className="mt-1 text-sm font-bold text-[#777]">
                  아이디: {selectedRequest.login_id}
                </p>

                <input
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                  type="text"
                  placeholder="임시 비밀번호"
                  className="mt-6 w-full rounded-2xl border border-[#ddd6d0] px-4 py-3 outline-none focus:border-[#c85b70]"
                />

                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={loading}
                  className="mt-4 w-full rounded-2xl bg-[#c85b70] py-3 font-extrabold text-white disabled:opacity-60"
                >
                  {loading ? '초기화 중...' : '임시 비밀번호로 변경'}
                </button>

                <p className="mt-3 text-xs font-semibold text-[#777]">
                  변경 후 회원에게 임시 비밀번호를 알려주세요.
                </p>
              </div>
            ) : (
              <p className="mt-10 text-sm font-bold text-[#999]">
                왼쪽에서 초기화 요청을 선택해주세요.
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-lg font-extrabold">처리 완료 내역</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {doneRequests.map((request) => (
              <div key={request.id} className="rounded-2xl bg-[#f7f5f2] px-4 py-3">
                <p className="font-extrabold">{request.nickname || '닉네임 없음'}</p>
                <p className="text-xs font-bold text-[#777]">
                  {request.login_id} · {request.status} · {request.processed_at ? new Date(request.processed_at).toLocaleString('ko-KR') : '-'}
                </p>
              </div>
            ))}

            {doneRequests.length === 0 && (
              <p className="col-span-2 rounded-2xl bg-[#f7f5f2] py-8 text-center text-sm font-bold text-[#999]">
                처리 완료 내역이 없습니다.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
