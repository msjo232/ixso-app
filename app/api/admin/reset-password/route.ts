import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 서버 환경변수가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function checkAdminPin(adminPin: string) {
  const savedPin = process.env.PASSWORD_RESET_ADMIN_PIN

  if (!savedPin) {
    throw new Error('PASSWORD_RESET_ADMIN_PIN 환경변수가 설정되지 않았습니다.')
  }

  if (adminPin !== savedPin) {
    throw new Error('관리자 PIN이 올바르지 않습니다.')
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, adminPin } = body

    checkAdminPin(adminPin)

    const supabaseAdmin = createAdminClient()

    if (action === 'list') {
      const { data, error } = await supabaseAdmin
        .from('password_reset_requests')
        .select('*')
        .order('requested_at', { ascending: false })
        .limit(100)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ requests: data ?? [] })
    }

    if (action === 'reset') {
      const { requestId, loginId, temporaryPassword } = body

      if (!requestId || !loginId || !temporaryPassword) {
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

      const { data: member, error: memberError } = await supabaseAdmin
        .from('members')
        .select('id, login_id, nickname, auth_user_id')
        .eq('login_id', loginId)
        .maybeSingle()

      if (memberError || !member) {
        return NextResponse.json(
          { error: '해당 아이디의 회원을 찾지 못했습니다.' },
          { status: 404 }
        )
      }

      if (!member.auth_user_id) {
        return NextResponse.json(
          { error: '해당 회원의 인증 계정이 연결되어 있지 않습니다. members.auth_user_id 값을 확인해주세요.' },
          { status: 404 }
        )
      }

      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(member.auth_user_id, {
          password: temporaryPassword,
        })

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
          memo: '관리자가 임시 비밀번호로 초기화함',
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
    }

    return NextResponse.json(
      { error: '알 수 없는 작업입니다.' },
      { status: 400 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
