import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { requestId, loginId, temporaryPassword, adminMemberId } = body

    if (!requestId || !loginId || !temporaryPassword || !adminMemberId) {
      return NextResponse.json(
        { error: '필수 정보가 부족합니다.' },
        { status: 400 }
      )
    }

    if (temporaryPassword.length < 6) {
      return NextResponse.json(
        { error: '임시 비밀번호는 6자 이상이어야 합니다.' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: '서버 환경변수가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, login_id, nickname, auth_user_id')
      .eq('login_id', loginId)
      .single()

    if (memberError || !member?.auth_user_id) {
      return NextResponse.json(
        { error: '해당 아이디의 회원 또는 인증 계정을 찾지 못했습니다.' },
        { status: 404 }
      )
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      member.auth_user_id,
      { password: temporaryPassword }
    )

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    const { error: requestError } = await supabaseAdmin
      .from('password_reset_requests')
      .update({
        status: 'done',
        processed_at: new Date().toISOString(),
        processed_by: adminMemberId,
        memo: `관리자가 임시 비밀번호로 초기화함`,
      })
      .eq('id', requestId)

    if (requestError) {
      return NextResponse.json(
        { error: requestError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      nickname: member.nickname,
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: '비밀번호 초기화 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
