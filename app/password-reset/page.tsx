'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PasswordResetRequestPage() {
  const [loginId, setLoginId] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)

  async function submitRequest() {
    const cleanLoginId = loginId.trim()
    const cleanNickname = nickname.trim()

    if (!cleanLoginId) {
      alert('아이디를 입력해주세요.')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('password_reset_requests')
      .insert({
        login_id: cleanLoginId,
        nickname: cleanNickname || null,
        status: 'pending',
      })

    setLoading(false)

    if (error) {
      console.error(error)
      alert('비밀번호 초기화 요청에 실패했습니다.')
      return
    }

    alert('비밀번호 초기화 요청을 보냈습니다. 운영진에게 문의해주세요.')
    setLoginId('')
    setNickname('')
  }

  return (
    <main className="min-h-screen bg-[#f8f5f1] px-5 py-10 text-[#252525]">
      <div className="mx-auto max-w-[480px]">
        <h1 className="text-[28px] font-black">비밀번호 찾기</h1>
        <p className="mt-2 text-[15px] font-semibold text-[#777]">
          아이디를 입력하면 관리자에게 초기화 요청이 전달됩니다.
        </p>

        <section className="mt-8 rounded-[28px] border border-[#d7d0ca] bg-white p-6 shadow-sm">
          <p className="text-[18px] font-extrabold">초기화 요청</p>

          <div className="mt-5 space-y-3">
            <input
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              placeholder="아이디"
              className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
            />

            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="닉네임"
              className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
            />
          </div>

          <button
            type="button"
            onClick={submitRequest}
            disabled={loading}
            className="mt-5 w-full rounded-[20px] bg-[#c85b70] py-4 text-[16px] font-extrabold text-white shadow-sm disabled:opacity-60"
          >
            {loading ? '요청 중...' : '초기화 요청하기'}
          </button>

          <a
            href="/"
            className="mt-5 block text-right text-[13px] font-bold text-[#777]"
          >
            메인으로 돌아가기
          </a>
        </section>
      </div>
    </main>
  )
}
