'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Member = {
  id: string
  nickname: string
  real_name?: string | null
  login_id?: string | null
  role?: string | null
}

type Attendance = {
  id: string
  member_id: string | null
  nickname_snapshot: string
  attend_date: string
  checkin_time: string
  payment_type: string
  payment_status?: string | null
  payment_amount?: number | null
  event_type?: string | null
  confirmed_at?: string | null
  confirmed_by?: string | null
  point_transaction_id?: string | null
}

type PointWallet = {
  member_id: string
  current_balance: number
}

type MonthlyMembership = {
  id: string
  member_id: string
  month_key: string
  status: string
  membership_type?: string | null
  price?: number | null
  members?: Member
}

type AdminTab = 'dashboard' | 'meeting' | 'payments' | 'members' | 'points' | 'monthly'

function getEventTypeLabel(type?: string | null) {
  if (type === 'mahjong') return '마작'
  return '보드게임'
}

function getPaymentStatusLabel(status?: string | null) {
  if (status === 'confirmed') return '확인완료'
  if (status === 'rejected') return '취소'
  return '확인대기'
}

function getMembershipTypeLabel(type?: string | null) {
  if (type === 'mahjong') return '마작통합'
  return '일반 보드게임'
}

function formatMoney(value?: number | null) {
  return `${(value ?? 0).toLocaleString()}원`
}

function getMonthKey(date = new Date()) {
  return date.toLocaleDateString('sv-SE').slice(0, 7)
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-')
  return `${year}년 ${Number(month)}월`
}

function moveMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  date.setMonth(date.getMonth() + offset)
  return date.toLocaleDateString('sv-SE').slice(0, 7)
}

export default function AdminPage() {
  const [checking, setChecking] = useState(true)
  const [adminMember, setAdminMember] = useState<Member | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard')

  const [pendingAttendances, setPendingAttendances] = useState<Attendance[]>([])
  const [recentConfirmed, setRecentConfirmed] = useState<Attendance[]>([])
  const [monthlyAttendances, setMonthlyAttendances] = useState<Attendance[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [wallets, setWallets] = useState<PointWallet[]>([])
  const [monthlyMemberships, setMonthlyMemberships] = useState<MonthlyMembership[]>([])

  const [memberKeyword, setMemberKeyword] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedBalance, setSelectedBalance] = useState(0)
  const [pointAmount, setPointAmount] = useState('')
  const [pointMemo, setPointMemo] = useState('')
  const [monthlyMonthKey, setMonthlyMonthKey] = useState(getMonthKey())
  const [historyMonthKey, setHistoryMonthKey] = useState(getMonthKey())
  const [membershipType, setMembershipType] = useState<'boardgame' | 'mahjong'>('boardgame')

  useEffect(() => {
    checkAdmin()
  }, [])

  useEffect(() => {
    if (adminMember) {
      refreshAll()
    }
  }, [adminMember])

  useEffect(() => {
    if (adminMember) {
      fetchMonthlyMemberships()
    }
  }, [monthlyMonthKey, adminMember])

  useEffect(() => {
    if (adminMember) {
      fetchMonthlyAttendances()
    }
  }, [historyMonthKey, adminMember])

  useEffect(() => {
    if (selectedMember) {
      fetchSelectedBalance(selectedMember.id)
    }
  }, [selectedMember?.id])

  async function checkAdmin() {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user

    if (!user) {
      setChecking(false)
      return
    }

    const { data: memberData } = await supabase
      .from('members')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (memberData?.role === 'admin') {
      setAdminMember(memberData)
    }

    setChecking(false)
  }

  async function refreshAll() {
    await Promise.all([
      fetchMembers(),
      fetchWallets(),
      fetchPendingAttendances(),
      fetchRecentConfirmed(),
      fetchMonthlyAttendances(),
      fetchMonthlyMemberships(),
    ])
  }

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('nickname', { ascending: true })

    if (!error) setMembers(data ?? [])
  }

  async function fetchWallets() {
    const { data, error } = await supabase
      .from('member_points')
      .select('*')

    if (!error) setWallets(data ?? [])
  }

  async function fetchPendingAttendances() {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('payment_status', 'pending')
      .order('attend_date', { ascending: false })
      .order('checkin_time', { ascending: false })
      .limit(100)

    if (!error) setPendingAttendances(data ?? [])
  }

  async function fetchRecentConfirmed() {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('payment_status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(100)

    if (!error) setRecentConfirmed(data ?? [])
  }

  async function fetchMonthlyAttendances() {
    const startDate = `${historyMonthKey}-01`
    const [year, month] = historyMonthKey.split('-').map(Number)
    const endDate = new Date(year, month, 1).toLocaleDateString('sv-SE')

    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .gte('attend_date', startDate)
      .lt('attend_date', endDate)
      .order('attend_date', { ascending: false })
      .order('checkin_time', { ascending: false })

    if (!error) setMonthlyAttendances(data ?? [])
  }

  async function fetchMonthlyMemberships() {
    const { data, error } = await supabase
      .from('monthly_memberships')
      .select('id, member_id, month_key, status, membership_type, price, members(*)')
      .eq('month_key', monthlyMonthKey)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (!error) setMonthlyMemberships((data ?? []) as MonthlyMembership[])
  }

  async function fetchSelectedBalance(memberId: string) {
    const { data } = await supabase
      .from('member_points')
      .select('current_balance')
      .eq('member_id', memberId)
      .maybeSingle()

    setSelectedBalance(data?.current_balance ?? 0)
  }

  const userRows = useMemo(() => {
    const keyword = memberKeyword.trim().toLowerCase()

    return members
      .filter((member) => {
        if (!keyword) return true
        return `${member.nickname} ${member.real_name ?? ''} ${member.login_id ?? ''}`
          .toLowerCase()
          .includes(keyword)
      })
      .map((member) => {
        const wallet = wallets.find((item) => item.member_id === member.id)
        const monthly = monthlyMemberships.find((item) => item.member_id === member.id)
        const memberAttendances = monthlyAttendances.filter((item) => item.member_id === member.id)
        const pendingCount = memberAttendances.filter((item) => item.payment_status === 'pending').length
        const confirmedCount = memberAttendances.filter((item) => item.payment_status === 'confirmed').length
        const rejectedCount = memberAttendances.filter((item) => item.payment_status === 'rejected').length
        const totalAmount = memberAttendances.reduce((sum, item) => sum + (item.payment_amount ?? 0), 0)

        return {
          ...member,
          point: wallet?.current_balance ?? 0,
          monthly,
          pendingCount,
          confirmedCount,
          rejectedCount,
          totalAmount,
          attendanceCount: memberAttendances.length,
        }
      })
  }, [members, wallets, monthlyMemberships, pendingAttendances, memberKeyword])

  async function confirmAttendance(attendance: Attendance) {
    if (!adminMember) return

    const amount = attendance.payment_amount ?? 0

    if (attendance.payment_type === '포인트') {
      if (!attendance.member_id) {
        alert('등록 회원이 아닌 참석자는 포인트 차감이 불가합니다.')
        return
      }

      const { data: wallet } = await supabase
        .from('member_points')
        .select('current_balance')
        .eq('member_id', attendance.member_id)
        .maybeSingle()

      const currentBalance = wallet?.current_balance ?? 0
      const balanceAfter = currentBalance - amount

      if (balanceAfter < 0) {
        alert('포인트 잔액이 부족합니다.')
        return
      }

      const { error: walletError } = await supabase
        .from('member_points')
        .upsert({
          member_id: attendance.member_id,
          current_balance: balanceAfter,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id' })

      if (walletError) {
        console.error(walletError)
        alert('포인트 차감에 실패했습니다.')
        return
      }

      const { data: txData, error: txError } = await supabase
        .from('point_transactions')
        .insert({
          member_id: attendance.member_id,
          type: 'use',
          amount: -amount,
          description: `${getEventTypeLabel(attendance.event_type)} 참석 차감`,
          event_type: attendance.event_type,
          related_attendance_id: attendance.id,
          attend_date_snapshot: attendance.attend_date,
        })
        .select('id')
        .single()

      if (txError) {
        console.error(txError)
        alert('포인트 이력 저장에 실패했습니다.')
        return
      }

      const { error: attendanceError } = await supabase
        .from('attendance_logs')
        .update({
          payment_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: adminMember.id,
          point_transaction_id: txData?.id ?? null,
        })
        .eq('id', attendance.id)

      if (attendanceError) {
        console.error(attendanceError)
        alert('확인 처리에 실패했습니다.')
        return
      }
    } else {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          payment_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: adminMember.id,
        })
        .eq('id', attendance.id)

      if (error) {
        console.error(error)
        alert('확인 처리에 실패했습니다.')
        return
      }
    }

    await refreshAll()
  }

  async function rejectAttendance(attendance: Attendance) {
    if (!adminMember) return

    const { error } = await supabase
      .from('attendance_logs')
      .update({
        payment_status: 'rejected',
        confirmed_at: new Date().toISOString(),
        confirmed_by: adminMember.id,
      })
      .eq('id', attendance.id)

    if (error) {
      console.error(error)
      alert('취소 처리에 실패했습니다.')
      return
    }

    await refreshAll()
  }

  async function changePoint(type: 'charge' | 'use' | 'adjust') {
    if (!selectedMember) {
      alert('회원을 선택해주세요.')
      return
    }

    const rawAmount = Number(pointAmount)

    if (!rawAmount || rawAmount <= 0) {
      alert('포인트 금액을 입력해주세요.')
      return
    }

    const signedAmount = type === 'use' ? -rawAmount : rawAmount
    const balanceAfter = selectedBalance + signedAmount

    if (balanceAfter < 0) {
      alert('잔액이 부족합니다.')
      return
    }

    const { error: walletError } = await supabase
      .from('member_points')
      .upsert({
        member_id: selectedMember.id,
        current_balance: balanceAfter,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'member_id' })

    if (walletError) {
      console.error(walletError)
      alert('포인트 반영에 실패했습니다.')
      return
    }

    const { error: txError } = await supabase
      .from('point_transactions')
      .insert({
        member_id: selectedMember.id,
        type: type === 'charge' ? 'charge' : type === 'use' ? 'use' : 'adjust',
        amount: signedAmount,
        description: pointMemo.trim() || null,
        event_type: 'manual',
      })

    if (txError) {
      console.error(txError)
      alert('포인트 이력 저장에 실패했습니다.')
      return
    }

    setPointAmount('')
    setPointMemo('')
    await refreshAll()
    await fetchSelectedBalance(selectedMember.id)
  }

  async function updateMonthlyStatus(isMonthly: boolean) {
    if (!selectedMember) {
      alert('회원을 선택해주세요.')
      return
    }

    if (isMonthly) {
      const { error } = await supabase
        .from('monthly_memberships')
        .upsert({
          member_id: selectedMember.id,
          month_key: monthlyMonthKey,
          status: 'active',
          membership_type: membershipType,
          price: membershipType === 'mahjong' ? 55000 : 45000,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id,month_key' })

      if (error) {
        console.error(error)
        alert('월회원 등록에 실패했습니다.')
        return
      }
    } else {
      const { error } = await supabase
        .from('monthly_memberships')
        .update({
          status: 'inactive',
          updated_at: new Date().toISOString(),
        })
        .eq('member_id', selectedMember.id)
        .eq('month_key', monthlyMonthKey)

      if (error) {
        console.error(error)
        alert('월회원 해제에 실패했습니다.')
        return
      }
    }

    await refreshAll()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] text-[#555]">
        관리자 권한 확인 중...
      </main>
    )
  }

  if (!adminMember) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-6">
        <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-xl font-extrabold">관리자 권한이 필요합니다.</p>
          <p className="mt-2 text-sm text-[#777]">관리자 계정으로 로그인 후 접속해주세요.</p>
          <a
            href="/"
            className="mt-6 inline-block rounded-2xl bg-[#c85b70] px-6 py-3 text-sm font-extrabold text-white"
          >
            모바일 화면으로 이동
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f5f2] text-[#252525]">
      <div className="flex min-h-screen">
        <aside className="w-72 border-r border-[#e2dcd7] bg-white p-6">
          <div>
            <p className="text-2xl font-extrabold">iXSO Admin 👑</p>
            <p className="mt-2 text-sm font-semibold text-[#777]">
              {adminMember.nickname} 관리자
            </p>
          </div>

          <nav className="mt-8 space-y-2">
            <SideButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>
              대시보드
            </SideButton>
            <SideButton active={activeTab === 'meeting'} onClick={() => setActiveTab('meeting')}>
              모임현황
            </SideButton>
            <SideButton active={activeTab === 'payments'} onClick={() => setActiveTab('payments')}>
              결제관리
            </SideButton>
            <SideButton active={activeTab === 'members'} onClick={() => setActiveTab('members')}>
              회원관리
            </SideButton>
            <SideButton active={activeTab === 'points'} onClick={() => setActiveTab('points')}>
              포인트관리
            </SideButton>
            <SideButton active={activeTab === 'monthly'} onClick={() => setActiveTab('monthly')}>
              월회원관리
            </SideButton>
          </nav>

          <button
            onClick={handleLogout}
            className="mt-8 w-full rounded-2xl bg-[#f1efec] py-3 text-sm font-extrabold text-[#555]"
          >
            로그아웃
          </button>
        </aside>

        <section className="flex-1 p-8">
          <div className="mx-auto max-w-7xl">
            <header className="mb-8 flex items-end justify-between">
              <div>
                <p className="text-sm font-bold text-[#c85b70]">관리자 PC 대시보드</p>
                <h1 className="mt-1 text-3xl font-extrabold">
                  {activeTab === 'dashboard' && '대시보드'}
                  {activeTab === 'payments' && '결제관리'}
                  {activeTab === 'meeting' && '모임현황'}
                  {activeTab === 'members' && '회원 전체 목록'}
                  {activeTab === 'points' && '포인트 관리'}
                  {activeTab === 'monthly' && '월회원 관리'}
                </h1>
              </div>

              <button
                onClick={refreshAll}
                className="rounded-2xl bg-[#252525] px-5 py-3 text-sm font-extrabold text-white"
              >
                새로고침
              </button>
            </header>

            {activeTab === 'dashboard' && (
              <Dashboard
                pendingCount={pendingAttendances.length}
                confirmedCount={recentConfirmed.length}
                memberCount={members.length}
                monthlyCount={monthlyMemberships.length}
              />
            )}

            {activeTab === 'meeting' && (
              <MeetingStatus
                historyMonthKey={historyMonthKey}
                setHistoryMonthKey={setHistoryMonthKey}
                monthlyAttendances={monthlyAttendances}
                userRows={userRows}
              />
            )}

            {activeTab === 'payments' && (
              <PaymentManager
                pendingAttendances={pendingAttendances}
                recentConfirmed={recentConfirmed}
                confirmAttendance={confirmAttendance}
                rejectAttendance={rejectAttendance}
              />
            )}

            {activeTab === 'members' && (
              <MembersList
                members={members}
                wallets={wallets}
                monthlyMemberships={monthlyMemberships}
                memberKeyword={memberKeyword}
                setMemberKeyword={setMemberKeyword}
              />
            )}

            {activeTab === 'points' && (
              <PointManager
                members={members}
                selectedMember={selectedMember}
                setSelectedMember={setSelectedMember}
                selectedBalance={selectedBalance}
                pointAmount={pointAmount}
                setPointAmount={setPointAmount}
                pointMemo={pointMemo}
                setPointMemo={setPointMemo}
                changePoint={changePoint}
              />
            )}

            {activeTab === 'monthly' && (
              <MonthlyManager
                members={members}
                selectedMember={selectedMember}
                setSelectedMember={setSelectedMember}
                monthlyMonthKey={monthlyMonthKey}
                setMonthlyMonthKey={setMonthlyMonthKey}
                monthlyMemberships={monthlyMemberships}
                membershipType={membershipType}
                setMembershipType={setMembershipType}
                updateMonthlyStatus={updateMonthlyStatus}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function SideButton(props: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={props.onClick}
      className={
        props.active
          ? 'w-full rounded-2xl bg-[#c85b70] px-4 py-3 text-left text-sm font-extrabold text-white'
          : 'w-full rounded-2xl px-4 py-3 text-left text-sm font-extrabold text-[#555] hover:bg-[#f7f5f2]'
      }
    >
      {props.children}
    </button>
  )
}

function Dashboard(props: {
  pendingCount: number
  confirmedCount: number
  memberCount: number
  monthlyCount: number
}) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="확인 대기" value={props.pendingCount} />
      <StatCard label="최근 완료" value={props.confirmedCount} />
      <StatCard label="전체 회원" value={props.memberCount} />
      <StatCard label="이번 달 월회원" value={props.monthlyCount} />
    </div>
  )
}

function StatCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-bold text-[#777]">{props.label}</p>
      <p className="mt-3 text-4xl font-extrabold text-[#c85b70]">{props.value}</p>
    </div>
  )
}

function MeetingStatus(props: {
  historyMonthKey: string
  setHistoryMonthKey: (value: string) => void
  monthlyAttendances: Attendance[]
  userRows: Array<Member & {
    point: number
    monthly?: MonthlyMembership
    pendingCount: number
    confirmedCount: number
    rejectedCount: number
    totalAmount: number
    attendanceCount: number
  }>
}) {
  const boardgameRows = props.monthlyAttendances.filter((item) => item.event_type !== 'mahjong')
  const mahjongRows = props.monthlyAttendances.filter((item) => item.event_type === 'mahjong')
  const pendingRows = props.monthlyAttendances.filter((item) => item.payment_status === 'pending')
  const confirmedRows = props.monthlyAttendances.filter((item) => item.payment_status === 'confirmed')
  const bankRows = props.monthlyAttendances.filter((item) => item.payment_type === '계좌이체')
  const pointRows = props.monthlyAttendances.filter((item) => item.payment_type === '포인트')
  const monthlyRows = props.monthlyAttendances.filter((item) => item.payment_type === '월회원')
  const totalAmount = props.monthlyAttendances.reduce((sum, item) => sum + (item.payment_amount ?? 0), 0)

  const dailyMap = new Map<string, {
    date: string
    total: number
    boardgame: number
    mahjong: number
    pending: number
    confirmed: number
    amount: number
  }>()

  props.monthlyAttendances.forEach((item) => {
    const prev = dailyMap.get(item.attend_date) ?? {
      date: item.attend_date,
      total: 0,
      boardgame: 0,
      mahjong: 0,
      pending: 0,
      confirmed: 0,
      amount: 0,
    }

    prev.total += 1
    if (item.event_type === 'mahjong') prev.mahjong += 1
    else prev.boardgame += 1
    if (item.payment_status === 'pending') prev.pending += 1
    if (item.payment_status === 'confirmed') prev.confirmed += 1
    prev.amount += item.payment_amount ?? 0

    dailyMap.set(item.attend_date, prev)
  })

  const dailyRows = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xl font-extrabold">모임현황</p>
            <p className="mt-1 text-sm font-bold text-[#777]">
              월별 모임 참석, 정산 상태, 결제방식 현황을 한눈에 봅니다.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-[#f7f5f2] p-2">
            <button
              onClick={() => props.setHistoryMonthKey(moveMonth(props.historyMonthKey, -1))}
              className="rounded-xl bg-white px-4 py-2 text-lg font-extrabold"
            >
              ‹
            </button>
            <p className="min-w-[140px] text-center text-lg font-extrabold text-[#c85b70]">
              {formatMonthLabel(props.historyMonthKey)}
            </p>
            <button
              onClick={() => props.setHistoryMonthKey(moveMonth(props.historyMonthKey, 1))}
              className="rounded-xl bg-white px-4 py-2 text-lg font-extrabold"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          <StatCard label="전체 모임 건수" value={props.monthlyAttendances.length} />
          <StatCard label="보드게임" value={boardgameRows.length} />
          <StatCard label="마작" value={mahjongRows.length} />
          <StatCard label="예상 정산금액" value={totalAmount} />
        </div>

        <div className="mt-3 grid grid-cols-5 gap-3">
          <MiniStatusCard label="확인대기" value={`${pendingRows.length}건`} />
          <MiniStatusCard label="확인완료" value={`${confirmedRows.length}건`} />
          <MiniStatusCard label="계좌이체" value={`${bankRows.length}건`} />
          <MiniStatusCard label="포인트" value={`${pointRows.length}건`} />
          <MiniStatusCard label="월회원" value={`${monthlyRows.length}건`} />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f1efec] text-[#555]">
            <tr>
              <th className="px-4 py-3">날짜</th>
              <th className="px-4 py-3">전체</th>
              <th className="px-4 py-3">보드게임</th>
              <th className="px-4 py-3">마작</th>
              <th className="px-4 py-3">확인대기</th>
              <th className="px-4 py-3">확인완료</th>
              <th className="px-4 py-3">금액</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((row) => (
              <tr key={row.date} className="border-t border-[#eee8e3]">
                <td className="px-4 py-3 font-extrabold">{row.date}</td>
                <td className="px-4 py-3">{row.total}건</td>
                <td className="px-4 py-3">{row.boardgame}건</td>
                <td className="px-4 py-3">{row.mahjong}건</td>
                <td className="px-4 py-3 text-[#a66b00] font-bold">{row.pending}건</td>
                <td className="px-4 py-3 text-[#1687bd] font-bold">{row.confirmed}건</td>
                <td className="px-4 py-3 font-extrabold">{formatMoney(row.amount)}</td>
              </tr>
            ))}

            {dailyRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center font-bold text-[#999]">
                  해당 월의 모임 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MiniStatusCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-[#777]">{props.label}</p>
      <p className="mt-2 text-xl font-extrabold text-[#252525]">{props.value}</p>
    </div>
  )
}

function PaymentManager(props: {
  pendingAttendances: Attendance[]
  recentConfirmed: Attendance[]
  confirmAttendance: (attendance: Attendance) => void
  rejectAttendance: (attendance: Attendance) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-lg font-extrabold">확인 대기</p>
        <PendingTable
          pendingAttendances={props.pendingAttendances}
          confirmAttendance={props.confirmAttendance}
          rejectAttendance={props.rejectAttendance}
        />
      </div>

      <div>
        <p className="mb-3 text-lg font-extrabold">최근 확인 완료</p>
        <ConfirmedTable confirmedAttendances={props.recentConfirmed} />
      </div>
    </div>
  )
}

function ConfirmedTable(props: { confirmedAttendances: Attendance[] }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f1efec] text-[#555]">
          <tr>
            <th className="px-4 py-3">날짜</th>
            <th className="px-4 py-3">닉네임</th>
            <th className="px-4 py-3">모임</th>
            <th className="px-4 py-3">결제방식</th>
            <th className="px-4 py-3">금액</th>
            <th className="px-4 py-3">상태</th>
          </tr>
        </thead>
        <tbody>
          {props.confirmedAttendances.map((item) => (
            <tr key={item.id} className="border-t border-[#eee8e3]">
              <td className="px-4 py-3 font-semibold">{item.attend_date}</td>
              <td className="px-4 py-3 font-extrabold">{item.nickname_snapshot}</td>
              <td className="px-4 py-3">{getEventTypeLabel(item.event_type)}</td>
              <td className="px-4 py-3">{item.payment_type}</td>
              <td className="px-4 py-3">{formatMoney(item.payment_amount)}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-[#e9f7ef] px-3 py-1 text-xs font-extrabold text-[#16874d]">
                  확인완료
                </span>
              </td>
            </tr>
          ))}

          {props.confirmedAttendances.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center font-bold text-[#999]">
                확인 완료 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PendingTable(props: {
  pendingAttendances: Attendance[]
  confirmAttendance: (attendance: Attendance) => void
  rejectAttendance: (attendance: Attendance) => void
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f1efec] text-[#555]">
          <tr>
            <th className="px-4 py-3">날짜</th>
            <th className="px-4 py-3">닉네임</th>
            <th className="px-4 py-3">모임</th>
            <th className="px-4 py-3">결제방식</th>
            <th className="px-4 py-3">금액</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3 text-right">처리</th>
          </tr>
        </thead>
        <tbody>
          {props.pendingAttendances.map((item) => (
            <tr key={item.id} className="border-t border-[#eee8e3]">
              <td className="px-4 py-3 font-semibold">{item.attend_date}</td>
              <td className="px-4 py-3 font-extrabold">{item.nickname_snapshot}</td>
              <td className="px-4 py-3">{getEventTypeLabel(item.event_type)}</td>
              <td className="px-4 py-3">{item.payment_type}</td>
              <td className="px-4 py-3">{formatMoney(item.payment_amount)}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-[#fff3d8] px-3 py-1 text-xs font-extrabold text-[#a66b00]">
                  {getPaymentStatusLabel(item.payment_status)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => props.confirmAttendance(item)}
                  className="mr-2 rounded-xl bg-[#c85b70] px-4 py-2 text-xs font-extrabold text-white"
                >
                  확인
                </button>
                <button
                  onClick={() => props.rejectAttendance(item)}
                  className="rounded-xl bg-[#777] px-4 py-2 text-xs font-extrabold text-white"
                >
                  취소
                </button>
              </td>
            </tr>
          ))}

          {props.pendingAttendances.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center font-bold text-[#999]">
                확인 대기 중인 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function UsersOverview(props: {
  userRows: Array<Member & {
    point: number
    monthly?: MonthlyMembership
    pendingCount: number
    confirmedCount: number
    rejectedCount: number
    totalAmount: number
    attendanceCount: number
  }>
  memberKeyword: string
  setMemberKeyword: (value: string) => void
  historyMonthKey: string
  setHistoryMonthKey: (value: string) => void
  monthlyAttendances: Attendance[]
}) {
  const confirmedTotal = props.monthlyAttendances
    .filter((item) => item.payment_status === 'confirmed')
    .reduce((sum, item) => sum + (item.payment_amount ?? 0), 0)

  const pendingTotal = props.monthlyAttendances
    .filter((item) => item.payment_status === 'pending')
    .reduce((sum, item) => sum + (item.payment_amount ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xl font-extrabold">월별 이용자 내역</p>
            <p className="mt-1 text-sm font-bold text-[#777]">
              선택한 월의 참석/정산 상태를 회원별로 확인합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-[#f7f5f2] p-2">
            <button
              onClick={() => props.setHistoryMonthKey(moveMonth(props.historyMonthKey, -1))}
              className="rounded-xl bg-white px-4 py-2 text-lg font-extrabold"
            >
              ‹
            </button>
            <p className="min-w-[140px] text-center text-lg font-extrabold text-[#c85b70]">
              {formatMonthLabel(props.historyMonthKey)}
            </p>
            <button
              onClick={() => props.setHistoryMonthKey(moveMonth(props.historyMonthKey, 1))}
              className="rounded-xl bg-white px-4 py-2 text-lg font-extrabold"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          <StatCard label="월 참석/정산 건수" value={props.monthlyAttendances.length} />
          <StatCard
            label="확인완료 금액"
            value={confirmedTotal}
          />
          <StatCard
            label="확인대기 금액"
            value={pendingTotal}
          />
          <StatCard
            label="이용 회원 수"
            value={props.userRows.filter((row) => row.attendanceCount > 0).length}
          />
        </div>
      </div>

      <input
        value={props.memberKeyword}
        onChange={(event) => props.setMemberKeyword(event.target.value)}
        placeholder="닉네임, 이름, 아이디 검색"
        className="w-full rounded-2xl border border-[#ddd6d0] bg-white px-4 py-3 text-sm outline-none focus:border-[#c85b70]"
      />

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f1efec] text-[#555]">
            <tr>
              <th className="px-4 py-3">닉네임</th>
              <th className="px-4 py-3">포인트</th>
              <th className="px-4 py-3">월회원</th>
              <th className="px-4 py-3">전체 건수</th>
              <th className="px-4 py-3">확인대기</th>
              <th className="px-4 py-3">확인완료</th>
              <th className="px-4 py-3">취소</th>
              <th className="px-4 py-3">월 합계</th>
            </tr>
          </thead>
          <tbody>
            {props.userRows.map((member) => (
              <tr key={member.id} className="border-t border-[#eee8e3]">
                <td className="px-4 py-3 font-extrabold">
                  {member.nickname} {member.role === 'admin' ? '👑' : ''}
                  <span className="block text-xs font-bold text-[#999]">{member.login_id || '-'}</span>
                </td>
                <td className="px-4 py-3 font-extrabold text-[#c85b70]">
                  {member.point.toLocaleString()}P
                </td>
                <td className="px-4 py-3">
                  {member.monthly
                    ? `${getMembershipTypeLabel(member.monthly.membership_type)} / ${formatMoney(member.monthly.price)}`
                    : '-'}
                </td>
                <td className="px-4 py-3">{member.attendanceCount}건</td>
                <td className="px-4 py-3 text-[#a66b00] font-bold">{member.pendingCount}건</td>
                <td className="px-4 py-3 text-[#1687bd] font-bold">{member.confirmedCount}건</td>
                <td className="px-4 py-3 text-[#777] font-bold">{member.rejectedCount}건</td>
                <td className="px-4 py-3 font-extrabold">{formatMoney(member.totalAmount)}</td>
              </tr>
            ))}

            {props.userRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center font-bold text-[#999]">
                  조회된 회원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MembersList(props: {
  members: Member[]
  wallets: PointWallet[]
  monthlyMemberships: MonthlyMembership[]
  memberKeyword: string
  setMemberKeyword: (value: string) => void
}) {
  const rows = props.members
    .filter((member) => {
      const keyword = props.memberKeyword.trim().toLowerCase()
      if (!keyword) return true
      return `${member.nickname} ${member.real_name ?? ''} ${member.login_id ?? ''}`
        .toLowerCase()
        .includes(keyword)
    })
    .map((member) => {
      const wallet = props.wallets.find((item) => item.member_id === member.id)
      const monthly = props.monthlyMemberships.find((item) => item.member_id === member.id)

      return {
        ...member,
        point: wallet?.current_balance ?? 0,
        monthly,
      }
    })

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <p className="text-xl font-extrabold">회원 전체 목록</p>
        <p className="mt-1 text-sm font-bold text-[#777]">
          가입된 회원의 기본 정보, 포인트, 이번 달 월회원 상태를 확인합니다.
        </p>
      </div>

      <input
        value={props.memberKeyword}
        onChange={(event) => props.setMemberKeyword(event.target.value)}
        placeholder="닉네임, 이름, 아이디 검색"
        className="w-full rounded-2xl border border-[#ddd6d0] bg-white px-4 py-3 text-sm outline-none focus:border-[#c85b70]"
      />

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f1efec] text-[#555]">
            <tr>
              <th className="px-4 py-3">닉네임</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">아이디</th>
              <th className="px-4 py-3">포인트</th>
              <th className="px-4 py-3">월회원</th>
              <th className="px-4 py-3">권한</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((member) => (
              <tr key={member.id} className="border-t border-[#eee8e3]">
                <td className="px-4 py-3 font-extrabold">
                  {member.nickname} {member.role === 'admin' ? '👑' : ''}
                </td>
                <td className="px-4 py-3">{member.real_name || '-'}</td>
                <td className="px-4 py-3">{member.login_id || '-'}</td>
                <td className="px-4 py-3 font-extrabold text-[#c85b70]">
                  {member.point.toLocaleString()}P
                </td>
                <td className="px-4 py-3">
                  {member.monthly
                    ? `${getMembershipTypeLabel(member.monthly.membership_type)} / ${formatMoney(member.monthly.price)}`
                    : '-'}
                </td>
                <td className="px-4 py-3">{member.role === 'admin' ? '관리자' : '일반회원'}</td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center font-bold text-[#999]">
                  조회된 회원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PointManager(props: {
  members: Member[]
  selectedMember: Member | null
  setSelectedMember: (member: Member | null) => void
  selectedBalance: number
  pointAmount: string
  setPointAmount: (value: string) => void
  pointMemo: string
  setPointMemo: (value: string) => void
  changePoint: (type: 'charge' | 'use' | 'adjust') => void
}) {
  return (
    <div className="grid grid-cols-[360px_1fr] gap-6">
      <MemberPicker
        members={props.members}
        selectedMember={props.selectedMember}
        setSelectedMember={props.setSelectedMember}
      />

      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-xl font-extrabold">포인트 관리</p>

        {props.selectedMember ? (
          <div className="mt-6 max-w-xl">
            <p className="text-sm font-bold text-[#777]">선택 회원</p>
            <p className="mt-1 text-2xl font-extrabold">{props.selectedMember.nickname}</p>

            <div className="mt-6 rounded-3xl bg-[#f7f5f2] p-6">
              <p className="text-sm font-bold text-[#777]">현재 포인트</p>
              <p className="mt-2 text-4xl font-extrabold text-[#c85b70]">
                {props.selectedBalance.toLocaleString()}P
              </p>
            </div>

            <input
              value={props.pointAmount}
              onChange={(event) => props.setPointAmount(event.target.value)}
              inputMode="numeric"
              placeholder="포인트 금액"
              className="mt-6 w-full rounded-2xl border border-[#ddd6d0] px-4 py-3 outline-none focus:border-[#c85b70]"
            />

            <input
              value={props.pointMemo}
              onChange={(event) => props.setPointMemo(event.target.value)}
              placeholder="메모"
              className="mt-3 w-full rounded-2xl border border-[#ddd6d0] px-4 py-3 outline-none focus:border-[#c85b70]"
            />

            <div className="mt-4 grid grid-cols-3 gap-3">
              <button onClick={() => props.changePoint('charge')} className="rounded-2xl bg-[#1687bd] py-3 font-extrabold text-white">
                충전
              </button>
              <button onClick={() => props.changePoint('use')} className="rounded-2xl bg-[#c85b70] py-3 font-extrabold text-white">
                차감
              </button>
              <button onClick={() => props.changePoint('adjust')} className="rounded-2xl bg-[#73998c] py-3 font-extrabold text-white">
                조정
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-10 text-sm font-bold text-[#999]">왼쪽에서 회원을 선택해주세요.</p>
        )}
      </div>
    </div>
  )
}

function MonthlyManager(props: {
  members: Member[]
  selectedMember: Member | null
  setSelectedMember: (member: Member | null) => void
  monthlyMonthKey: string
  setMonthlyMonthKey: (value: string) => void
  monthlyMemberships: MonthlyMembership[]
  membershipType: 'boardgame' | 'mahjong'
  setMembershipType: (value: 'boardgame' | 'mahjong') => void
  updateMonthlyStatus: (isMonthly: boolean) => void
}) {
  const selectedIsMonthly = props.selectedMember
    ? props.monthlyMemberships.some((item) => item.member_id === props.selectedMember?.id)
    : false

  return (
    <div className="grid grid-cols-[360px_1fr] gap-6">
      <MemberPicker
        members={props.members}
        selectedMember={props.selectedMember}
        setSelectedMember={props.setSelectedMember}
      />

      <div className="space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-xl font-extrabold">월회원 관리</p>

          <div className="mt-6 flex max-w-md items-center justify-between rounded-3xl bg-[#f7f5f2] p-4">
            <button
              onClick={() => props.setMonthlyMonthKey(moveMonth(props.monthlyMonthKey, -1))}
              className="rounded-full bg-white px-4 py-2 text-xl font-extrabold"
            >
              ‹
            </button>
            <p className="text-2xl font-extrabold text-[#c85b70]">
              {formatMonthLabel(props.monthlyMonthKey)}
            </p>
            <button
              onClick={() => props.setMonthlyMonthKey(moveMonth(props.monthlyMonthKey, 1))}
              className="rounded-full bg-white px-4 py-2 text-xl font-extrabold"
            >
              ›
            </button>
          </div>

          {props.selectedMember ? (
            <div className="mt-6 max-w-xl">
              <p className="text-sm font-bold text-[#777]">선택 회원</p>
              <p className="mt-1 text-2xl font-extrabold">
                {props.selectedMember.nickname} / {selectedIsMonthly ? '월회원 이용중' : '일반회원'}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button
                  onClick={() => props.setMembershipType('boardgame')}
                  className={
                    props.membershipType === 'boardgame'
                      ? 'rounded-2xl bg-[#c85b70] py-4 font-extrabold text-white'
                      : 'rounded-2xl bg-[#f1efec] py-4 font-extrabold text-[#555]'
                  }
                >
                  일반 보드게임<br />45,000원
                </button>
                <button
                  onClick={() => props.setMembershipType('mahjong')}
                  className={
                    props.membershipType === 'mahjong'
                      ? 'rounded-2xl bg-[#252525] py-4 font-extrabold text-white'
                      : 'rounded-2xl bg-[#f1efec] py-4 font-extrabold text-[#555]'
                  }
                >
                  마작통합<br />55,000원
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={() => props.updateMonthlyStatus(true)}
                  className="rounded-2xl bg-[#b985df] py-3 font-extrabold text-white"
                >
                  월회원 등록
                </button>
                <button
                  onClick={() => props.updateMonthlyStatus(false)}
                  className="rounded-2xl bg-[#777] py-3 font-extrabold text-white"
                >
                  월회원 해제
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-10 text-sm font-bold text-[#999]">왼쪽에서 회원을 선택해주세요.</p>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-xl font-extrabold">{formatMonthLabel(props.monthlyMonthKey)} 월회원</p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {props.monthlyMemberships.map((item) => (
              <div key={item.id} className="rounded-2xl bg-[#f7f5f2] p-4">
                <p className="font-extrabold">{item.members?.nickname}</p>
                <p className="mt-1 text-sm font-bold text-[#777]">
                  {getMembershipTypeLabel(item.membership_type)} / {formatMoney(item.price)}
                </p>
              </div>
            ))}

            {props.monthlyMemberships.length === 0 && (
              <p className="col-span-3 py-8 text-center text-sm font-bold text-[#999]">
                등록된 월회원이 없습니다.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MemberPicker(props: {
  members: Member[]
  selectedMember: Member | null
  setSelectedMember: (member: Member | null) => void
}) {
  const [keyword, setKeyword] = useState('')

  const filtered = props.members.filter((member) => {
    if (!keyword.trim()) return true
    return `${member.nickname} ${member.real_name ?? ''} ${member.login_id ?? ''}`
      .toLowerCase()
      .includes(keyword.toLowerCase())
  })

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-lg font-extrabold">회원 선택</p>
      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="회원 검색"
        className="mt-4 w-full rounded-2xl border border-[#ddd6d0] px-4 py-3 outline-none focus:border-[#c85b70]"
      />

      <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {filtered.map((member) => (
          <button
            key={member.id}
            onClick={() => props.setSelectedMember(member)}
            className={
              props.selectedMember?.id === member.id
                ? 'w-full rounded-2xl bg-[#c85b70] px-4 py-3 text-left font-extrabold text-white'
                : 'w-full rounded-2xl bg-[#f7f5f2] px-4 py-3 text-left font-extrabold text-[#555]'
            }
          >
            {member.nickname} {member.role === 'admin' ? '👑' : ''}
            <span className="block text-xs font-bold opacity-70">{member.login_id || '-'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
