'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Member = {
  id: string
  nickname: string
  real_name?: string | null
  login_id?: string | null
  role?: string | null
  is_monthly?: boolean | null
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
  import_source?: string | null
  import_key?: string | null
}

type PointTransaction = {
  id: string
  member_id: string
  type: string
  amount: number
  balance_after: number
  memo?: string | null
  event_type?: string | null
  related_attendance_id?: string | null
  attend_date_snapshot?: string | null
  created_at: string
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

type MahjongSettlementRow = {
  date: string
  nickname: string
  memberId: string | null
  gameCount: number
  fee: number
  rawFee: number
  capFee: number
  isWeekend: boolean
  isMahjongMonthly: boolean
  paymentType: string
  importKey: string
}

type Tab = 'home' | 'meeting' | 'my'
type AuthMode = 'login' | 'signup'

function formatDateLabel(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
}

function moveDate(dateString: string, dayOffset: number) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + dayOffset)
  return date.toLocaleDateString('sv-SE')
}

function getMonthKey(dateString: string) {
  return dateString.slice(0, 7)
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-')
  return `${year}년 ${Number(month)}월`
}

function getMembershipTypeLabel(type?: string | null) {
  if (type === 'mahjong') return '마작통합 월회원'
  return '일반 보드게임 월회원'
}

function getMembershipPrice(type: 'boardgame' | 'mahjong') {
  return type === 'mahjong' ? 55000 : 45000
}

function getEventTypeLabel(type?: string | null) {
  if (type === 'mahjong') return '마작모임'
  return '보드게임'
}

function getPaymentStatusLabel(status?: string | null) {
  if (status === 'confirmed') return '확인완료'
  if (status === 'rejected') return '취소'
  return '확인대기'
}

function isWeekendDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const dayOfWeek = date.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

function parseCsvLine(line: string) {
  const result: string[] = []
  let current = ''
  let insideQuote = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"' && insideQuote && nextChar === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      insideQuote = !insideQuote
      continue
    }

    if (char === ',' && !insideQuote) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result
}

function parseCsvText(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const row: Record<string, string> = {}

    headers.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? ''
    })

    return row
  })
}

function extractKmlNickname(value?: string) {
  if (!value) return ''

  const match = value.match(/\][^:]*?([^\]:]+):/)
  if (match?.[1]) return match[1].trim()

  const fallback = value.split(':')[0]?.replace(/\[[^\]]+\]/g, '').trim()
  return fallback ?? ''
}

function moveMonth(monthKey: string, monthOffset: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  date.setMonth(date.getMonth() + monthOffset)
  return date.toLocaleDateString('sv-SE').slice(0, 7)
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [showAdminPage, setShowAdminPage] = useState(false)
  const [currentMember, setCurrentMember] = useState<Member | null>(null)
  const [authChecking, setAuthChecking] = useState(true)

  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [monthlyMonthKey, setMonthlyMonthKey] = useState(getMonthKey(new Date().toLocaleDateString('sv-SE')))
  const [currentMonthlyMembers, setCurrentMonthlyMembers] = useState<Member[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [attendees, setAttendees] = useState<Attendance[]>([])
  const [nicknameInput, setNicknameInput] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [paymentType, setPaymentType] = useState('계좌이체')
  const [eventType, setEventType] = useState<'boardgame' | 'mahjong'>('boardgame')
  const [loading, setLoading] = useState(false)
  const [isAttendModalOpen, setIsAttendModalOpen] = useState(false)

  const todayLabel = formatDateLabel(selectedDate)

  useEffect(() => {
    fetchMembers()
    checkLoginSession()
  }, [])

  useEffect(() => {
    fetchDateAttendees()
  }, [selectedDate])

  useEffect(() => {
    fetchMonthlyMembers(monthlyMonthKey)
  }, [monthlyMonthKey])

  const filteredMembers = useMemo(() => {
    const keyword = nicknameInput.trim().toLowerCase()
    if (!keyword) return members.slice(0, 8)

    return members
      .filter((member) => member.nickname.toLowerCase().includes(keyword))
      .slice(0, 8)
  }, [members, nicknameInput])

  const groupedAttendees = useMemo(() => {
    return {
      bank: attendees.filter((item) => item.payment_type === '계좌이체'),
      point: attendees.filter((item) => item.payment_type === '포인트'),
      monthly: attendees.filter((item) => item.payment_type === '월회원'),
    }
  }, [attendees])



  async function checkLoginSession() {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user

    if (!user) {
      setAuthChecking(false)
      return
    }

    const { data: memberData, error } = await supabase
      .from('members')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (!error && memberData) {
      setCurrentMember(memberData)
    }

    setAuthChecking(false)
  }

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('nickname', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    if (data) setMembers(data)
  }

  async function fetchDateAttendees() {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('attend_date', selectedDate)
      .order('checkin_time', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    if (data) setAttendees(data)
  }

  async function fetchMonthlyMembers(monthKey: string) {
    const { data, error } = await supabase
      .from('monthly_memberships')
      .select('member_id, month_key, status, membership_type, price, members(*)')
      .eq('month_key', monthKey)
      .eq('status', 'active')

    if (error) {
      console.error(error)
      setCurrentMonthlyMembers([])
      return
    }

    const monthly = (data ?? [])
      .map((item: any) => item.members)
      .filter(Boolean)

    setCurrentMonthlyMembers(monthly)
  }

  function selectMember(member: Member) {
    setSelectedMember(member)
    setNicknameInput(member.nickname)
  }

  async function registerAttendance() {
    const nickname = selectedMember?.nickname || nicknameInput.trim()

    if (!nickname) {
      alert('닉네임을 입력하거나 선택해주세요.')
      return
    }

    setLoading(true)

    const { error } = await supabase.from('attendance_logs').insert({
      member_id: selectedMember?.id ?? null,
      nickname_snapshot: nickname,
      attend_date: selectedDate,
      payment_type: paymentType,
      payment_status: 'pending',
      payment_amount: paymentType === '월회원' ? 0 : eventType === 'mahjong' ? 4000 : 7000,
      event_type: eventType,
    })

    setLoading(false)

    if (error) {
      console.error(error)
      alert('참석 등록 중 오류가 발생했습니다.')
      return
    }

    setNicknameInput('')
    setSelectedMember(null)
    setPaymentType('계좌이체')
    setEventType('boardgame')
    setIsAttendModalOpen(false)
    await fetchDateAttendees()
  }

  return (
    <main className="min-h-screen bg-[#f7f5f2] pb-24 text-[#252525]">
      <div className="mx-auto min-h-screen max-w-[430px] px-5 pt-7">
        {activeTab === 'home' && <HomeInfoScreen monthlyMembers={currentMonthlyMembers} monthKey={monthlyMonthKey} />}

        {activeTab === 'meeting' && (
          <MeetingScreen
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            todayLabel={todayLabel}
            attendeesCount={attendees.length}
            groupedAttendees={groupedAttendees}
            openAttendModal={() => setIsAttendModalOpen(true)}
          />
        )}

        {activeTab === 'my' && (
          authChecking ? (
            <div className="pt-10 text-center text-[14px] font-bold text-[#777]">
              로그인 상태 확인 중...
            </div>
          ) : currentMember ? (
            showAdminPage && currentMember.role === 'admin' ? (
              <AdminScreen
                goBack={() => setShowAdminPage(false)}
                currentMember={currentMember}
                monthlyMonthKey={monthlyMonthKey}
                setMonthlyMonthKey={setMonthlyMonthKey}
                refreshHomeMonthlyMembers={() => fetchMonthlyMembers(monthlyMonthKey)}
              />
            ) : (
              <MyPage
                member={currentMember}
                setCurrentMember={setCurrentMember}
                openAdminPage={() => setShowAdminPage(true)}
              />
            )
          ) : (
            <AuthScreen authMode={authMode} setAuthMode={setAuthMode} setCurrentMember={setCurrentMember} />
          )
        )}
      </div>

      {isAttendModalOpen && (
        <AttendModal
          todayLabel={todayLabel}
          nicknameInput={nicknameInput}
          setNicknameInput={setNicknameInput}
          selectedMember={selectedMember}
          setSelectedMember={setSelectedMember}
          filteredMembers={filteredMembers}
          selectMember={selectMember}
          paymentType={paymentType}
          setPaymentType={setPaymentType}
          eventType={eventType}
          setEventType={setEventType}
          loading={loading}
          closeModal={() => setIsAttendModalOpen(false)}
          registerAttendance={registerAttendance}
        />
      )}

      <BottomTabs activeTab={activeTab} setActiveTab={(tab) => {
        setActiveTab(tab)
        if (tab !== 'my') setShowAdminPage(false)
      }} />
    </main>
  )
}

function HomeInfoScreen(props: { monthlyMembers: Member[]; monthKey: string }) {
  const { monthlyMembers, monthKey } = props
  const accountNumber = '농협 355-0062-5757-73'

  async function copyAccountNumber() {
    try {
      await navigator.clipboard.writeText(accountNumber)
      alert('계좌번호를 복사했습니다.')
    } catch {
      alert(accountNumber)
    }
  }

  return (
    <div className="space-y-5">
      <section className="pt-2">
        <p className="text-[15px] font-semibold text-[#4f4f4f]">안녕하세요 😊</p>
        <p className="mt-2 text-[26px] font-extrabold">익쏘 보드게임</p>
        <p className="mt-1 text-[14px] text-[#777]">
          모임 안내와 회비 정보를 확인하세요.
        </p>
      </section>

      <section className="rounded-[18px] border border-[#cfc8c2] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-extrabold">{formatMonthLabel(monthKey)} 월회원</p>
          <span className="rounded-full bg-[#f1e8e6] px-3 py-1 text-[12px] font-bold text-[#c85b70]">
            {monthlyMembers.length}명
          </span>
        </div>

        {monthlyMembers.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {monthlyMembers.map((member) => (
              <div
                key={member.id}
                className="truncate rounded-xl bg-[#f7f5f2] px-2 py-3 text-center text-[13px] font-bold text-[#444]"
              >
                {member.nickname}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-[#f7f5f2] py-5 text-center text-[14px] font-semibold text-[#999]">
            등록된 월회원이 없습니다.
          </p>
        )}
      </section>

      <section className="rounded-[18px] border border-[#cfc8c2] bg-white p-4 shadow-sm">
        <p className="text-[15px] font-extrabold">회비 안내</p>

        <div className="mt-4 space-y-3">
          <FeeRow title="평일" price="7,000원" desc="월요일~금요일 모임 기준" />
          <FeeRow title="주말 및 공휴일" price="10,000원" desc="토요일, 일요일, 공휴일 기준" />
        </div>

        <div className="mt-4 rounded-2xl bg-[#f7f5f2] px-4 py-4">
          <p className="text-[13px] font-bold text-[#777]">계좌번호</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[16px] font-extrabold">{accountNumber}</p>
            <button
              onClick={copyAccountNumber}
              className="shrink-0 rounded-full bg-[#c85b70] px-4 py-2 text-[13px] font-extrabold text-white"
            >
              복사
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-[#cfc8c2] bg-white p-4 shadow-sm">
        <p className="text-[15px] font-extrabold">포인트 안내</p>

        <div className="mt-4 rounded-2xl bg-[#f7f5f2] px-4 py-4">
          <p className="text-[18px] font-extrabold text-[#c85b70]">
            50,000원 충전 시 10% 추가 적립
          </p>
          <p className="mt-2 text-[14px] leading-6 text-[#666]">
            50,000원 입금 시 55,000P가 적립됩니다.
          </p>
        </div>

        <div className="mt-3 rounded-2xl bg-[#f7f5f2] px-4 py-4">
          <p className="text-[14px] font-bold text-[#555]">포인트 충전은 운영진에게 문의해주세요.</p>
        </div>
      </section>

      <section className="rounded-[18px] border border-[#cfc8c2] bg-white p-4 shadow-sm">
        <p className="text-[15px] font-extrabold">이용 안내</p>
        <div className="mt-4 space-y-2 text-[14px] leading-6 text-[#666]">
          <p>• 모임 탭에서 날짜별 참석자를 확인할 수 있습니다.</p>
          <p>• 나의 익쏘에서 포인트와 회원 정보를 확인할 수 있습니다.</p>
          <p>• 관리자는 나의 익쏘에서 관리자 페이지로 접속할 수 있습니다.</p>
        </div>
      </section>
    </div>
  )
}

function FeeRow(props: { title: string; price: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-[#f7f5f2] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-extrabold">{props.title}</p>
        <p className="text-[14px] font-extrabold text-[#c85b70]">{props.price}</p>
      </div>
      <p className="mt-1 text-[12px] font-semibold text-[#777]">{props.desc}</p>
    </div>
  )
}

function MeetingScreen(props: {
  selectedDate: string
  setSelectedDate: (date: string) => void
  todayLabel: string
  attendeesCount: number
  groupedAttendees: {
    bank: Attendance[]
    point: Attendance[]
    monthly: Attendance[]
  }
  openAttendModal: () => void
}) {
  const {
    selectedDate,
    setSelectedDate,
    todayLabel,
    attendeesCount,
    groupedAttendees,
    openAttendModal,
  } = props

  function openDatePicker() {
    const input = document.getElementById('ixso-date-picker') as HTMLInputElement | null
    input?.showPicker?.()
    input?.click()
  }

  return (
    <div className="space-y-5">
      <section className="pt-2">
        <p className="text-[22px] font-extrabold">모임</p>

        <div className="relative mt-3 flex items-center justify-between px-2">
          <button
            onClick={() => setSelectedDate(moveDate(selectedDate, -1))}
            className="text-3xl font-bold text-[#9b9b9b]"
            aria-label="이전 날짜"
          >
            ‹
          </button>

          <button
            onClick={openDatePicker}
            className="rounded-2xl px-4 py-2 text-[18px] font-extrabold active:bg-[#f1efec]"
          >
            {todayLabel}
          </button>

          <button
            onClick={() => setSelectedDate(moveDate(selectedDate, 1))}
            className="text-3xl font-bold text-[#9b9b9b]"
            aria-label="다음 날짜"
          >
            ›
          </button>

          <input
            id="ixso-date-picker"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 opacity-0"
            aria-label="날짜 선택"
          />
        </div>
      </section>

      <button
        onClick={openAttendModal}
        className="w-full rounded-[20px] bg-[#c85b70] py-4 text-[16px] font-extrabold text-white shadow-sm"
      >
        모임참석
      </button>

      <section className="rounded-[18px] border border-[#cfc8c2] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-extrabold">참석자 리스트</p>
          <p className="text-[17px] font-extrabold">{attendeesCount}명</p>
        </div>

        <AttendanceTable
          bank={groupedAttendees.bank}
          point={groupedAttendees.point}
          monthly={groupedAttendees.monthly}
        />
      </section>
    </div>
  )
}

function AttendanceTable(props: {
  bank: Attendance[]
  point: Attendance[]
  monthly: Attendance[]
}) {
  const { bank, point, monthly } = props
  const maxRows = Math.max(bank.length, point.length, monthly.length, 1)

  const rows = Array.from({ length: maxRows }).map((_, index) => ({
    bank: bank[index],
    point: point[index],
    monthly: monthly[index],
  }))

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e2dcd7] bg-white">
      <div className="grid grid-cols-3 bg-[#f1efec] text-center text-[13px] font-extrabold">
        <div className="border-r border-[#e2dcd7] py-3 text-[#5f8d7d]">계좌이체</div>
        <div className="border-r border-[#e2dcd7] py-3 text-[#1687bd]">포인트</div>
        <div className="py-3 text-[#a96ad1]">월회원</div>
      </div>

      {rows.map((row, index) => (
        <div
          key={index}
          className="grid grid-cols-3 border-t border-[#eee8e3] text-center text-[13px] font-bold text-[#444]"
        >
          <div className="min-h-[38px] border-r border-[#eee8e3] px-1 py-2">
            {row.bank ? `${row.bank.nickname_snapshot}${row.bank.payment_status === 'confirmed' ? ' ✓' : ''}` : ''}
          </div>
          <div className="min-h-[38px] border-r border-[#eee8e3] px-1 py-2">
            {row.point ? `${row.point.nickname_snapshot}${row.point.payment_status === 'confirmed' ? ' ✓' : ''}` : ''}
          </div>
          <div className="min-h-[38px] px-1 py-2">
            {row.monthly ? `${row.monthly.nickname_snapshot}${row.monthly.payment_status === 'confirmed' ? ' ✓' : ''}` : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

function AttendModal(props: {
  todayLabel: string
  nicknameInput: string
  setNicknameInput: (value: string) => void
  selectedMember: Member | null
  setSelectedMember: (member: Member | null) => void
  filteredMembers: Member[]
  selectMember: (member: Member) => void
  paymentType: string
  setPaymentType: (value: string) => void
  eventType: 'boardgame' | 'mahjong'
  setEventType: (value: 'boardgame' | 'mahjong') => void
  loading: boolean
  closeModal: () => void
  registerAttendance: () => void
}) {
  const {
    todayLabel,
    nicknameInput,
    setNicknameInput,
    selectedMember,
    setSelectedMember,
    filteredMembers,
    selectMember,
    paymentType,
    setPaymentType,
    eventType,
    setEventType,
    loading,
    closeModal,
    registerAttendance,
  } = props

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 px-4 pb-4">
      <div className="w-full max-w-[430px] rounded-[28px] border border-[#d7d0ca] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[18px] font-extrabold">모임참석</p>
            <p className="mt-1 text-[13px] text-[#777]">{todayLabel}</p>
          </div>
          <button
            onClick={closeModal}
            className="rounded-full bg-[#f1efec] px-4 py-2 text-[13px] font-bold text-[#555]"
          >
            닫기
          </button>
        </div>

        <input
          value={nicknameInput}
          onChange={(event) => {
            setNicknameInput(event.target.value)
            setSelectedMember(null)
          }}
          placeholder="닉네임 검색 또는 직접 입력"
          className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-3 text-[15px] outline-none focus:border-[#c85b70]"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {filteredMembers.map((member) => {
            const active = selectedMember?.id === member.id

            return (
              <button
                key={member.id}
                onClick={() => selectMember(member)}
                className={
                  active
                    ? 'rounded-full bg-[#c85b70] px-3 py-2 text-[13px] font-bold text-white'
                    : 'rounded-full bg-[#f1efec] px-3 py-2 text-[13px] font-semibold text-[#555]'
                }
              >
                {member.nickname}
              </button>
            )
          })}
        </div>

        {!selectedMember && nicknameInput.trim() && (
          <p className="mt-3 text-[12px] text-[#777]">
            등록 회원이 아니면 입력한 닉네임 그대로 참석 등록됩니다.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          {[
            { label: '보드게임', value: 'boardgame' as const, fee: '7,000원' },
            { label: '마작모임', value: 'mahjong' as const, fee: '4,000원' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setEventType(item.value)}
              className={
                eventType === item.value
                  ? 'rounded-2xl bg-[#252525] px-2 py-3 text-[13px] font-bold text-white shadow-sm'
                  : 'rounded-2xl bg-[#f1efec] px-2 py-3 text-[13px] font-bold text-[#555] shadow-sm'
              }
            >
              {item.label}<br />{item.fee}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: '계좌이체', color: '#73998c' },
            { label: '포인트', color: '#1687bd' },
            { label: '월회원', color: '#b985df' },
          ].map((type) => (
            <button
              key={type.label}
              onClick={() => setPaymentType(type.label)}
              className="rounded-2xl px-2 py-3 text-[13px] font-bold shadow-sm"
              style={{
                backgroundColor: paymentType === type.label ? type.color : '#f1efec',
                color: paymentType === type.label ? '#fff' : '#555',
              }}
            >
              {type.label}
            </button>
          ))}
        </div>

        <button
          onClick={registerAttendance}
          disabled={loading}
          className="mt-5 w-full rounded-[20px] bg-[#c85b70] py-4 text-[16px] font-extrabold text-white shadow-sm disabled:opacity-60"
        >
          {loading ? '등록 중...' : '참석'}
        </button>
      </div>
    </div>
  )
}

function AuthScreen(props: {
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void
  setCurrentMember: (member: Member | null) => void
}) {
  const { authMode, setAuthMode, setCurrentMember } = props

  if (authMode === 'signup') {
    return <SignupScreen setAuthMode={setAuthMode} />
  }

  return <LoginScreen setAuthMode={setAuthMode} setCurrentMember={setCurrentMember} />
}

function LoginScreen(props: {
  setAuthMode: (mode: AuthMode) => void
  setCurrentMember: (member: Member | null) => void
}) {
  const { setAuthMode, setCurrentMember } = props

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  async function handleLogin() {
    const cleanLoginId = loginId.trim()

    if (!cleanLoginId || !password.trim()) {
      alert('아이디와 비밀번호를 입력해주세요.')
      return
    }

    setLoginLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: `${cleanLoginId}@ixso.com`,
      password,
    })

    if (authError) {
      setLoginLoading(false)
      console.error(authError)
      alert(authError.message)
      return
    }

    const authUserId = authData.user?.id

    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('*')
      .eq('auth_user_id', authUserId)
      .single()

    setLoginLoading(false)

    if (memberError || !memberData) {
      console.error(memberError)
      alert('로그인은 되었지만 회원 정보를 찾지 못했습니다.')
      return
    }

    setCurrentMember(memberData)
  }

  return (
    <div className="space-y-5">
      <section className="pt-2">
        <p className="text-[22px] font-extrabold">로그인</p>
        <p className="mt-1 text-[14px] text-[#777]">
          내 포인트와 활동 기록은 로그인 후 확인할 수 있습니다.
        </p>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[15px] font-bold">나의 익쏘 이용하기</p>

        <div className="mt-5 space-y-3">
          <input
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="아이디"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="비밀번호"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loginLoading}
          className="mt-5 w-full rounded-[20px] bg-[#c85b70] py-4 text-[16px] font-extrabold text-white shadow-sm disabled:opacity-60"
        >
          {loginLoading ? '로그인 중...' : '로그인'}
        </button>

        <div className="mt-5 flex items-center justify-between text-[13px] font-bold text-[#777]">
          <button onClick={() => setAuthMode('signup')}>회원가입</button>
          <button>비밀번호 찾기</button>
        </div>
      </section>
    </div>
  )
}

function SignupScreen(props: {
  setAuthMode: (mode: AuthMode) => void
}) {
  const { setAuthMode } = props

  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)

  async function handleSignup() {
    const cleanLoginId = loginId.trim()
    const cleanNickname = nickname.trim()

    if (!name.trim() || !cleanNickname || !cleanLoginId || !password.trim()) {
      alert('이름, 닉네임, 아이디, 비밀번호를 입력해주세요.')
      return
    }

    setSignupLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: `${cleanLoginId}@ixso.com`,
      password,
    })

    if (authError) {
      setSignupLoading(false)
      console.error(authError)
      alert(authError.message)
      return
    }

    const { error: insertError } = await supabase.from('members').insert({
      login_id: cleanLoginId,
      nickname: cleanNickname,
      real_name: name.trim(),
      phone: phone.trim() || null,
      auth_user_id: authData.user?.id ?? null,
    })

    setSignupLoading(false)

    if (insertError) {
      console.error(insertError)
      alert('이미 사용 중인 닉네임이거나 회원 정보 저장에 실패했습니다.')
      return
    }

    alert('회원가입이 완료되었습니다. 로그인해주세요.')
    setAuthMode('login')
  }

  return (
    <div className="space-y-5">
      <section className="pt-2">
        <p className="text-[22px] font-extrabold">회원가입</p>
        <p className="mt-1 text-[14px] text-[#777]">
          익쏘 앱에서 사용할 계정을 만들어주세요.
        </p>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[15px] font-bold">기본 정보</p>

        <div className="mt-5 space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름(실명)"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="닉네임"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
          <input
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="아이디"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="비밀번호"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="휴대폰 번호"
            className="w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-4 text-[15px] outline-none focus:border-[#c85b70]"
          />
        </div>

        <button
          onClick={handleSignup}
          disabled={signupLoading}
          className="mt-5 w-full rounded-[20px] bg-[#c85b70] py-4 text-[16px] font-extrabold text-white shadow-sm disabled:opacity-60"
        >
          {signupLoading ? '가입 중...' : '회원가입'}
        </button>

        <button
          onClick={() => setAuthMode('login')}
          className="mt-5 w-full text-right text-[13px] font-bold text-[#777]"
        >
          로그인으로 돌아가기
        </button>
      </section>
    </div>
  )
}

function MyPage(props: {
  member: Member
  setCurrentMember: (member: Member | null) => void
  openAdminPage: () => void
}) {
  const { member, setCurrentMember, openAdminPage } = props
  const isAdmin = member.role === 'admin'
  const [myBalance, setMyBalance] = useState(0)
  const [myTransactions, setMyTransactions] = useState<PointTransaction[]>([])

  useEffect(() => {
    fetchMyPoint()
    fetchMyTransactions()
  }, [member.id])

  async function fetchMyPoint() {
    const { data } = await supabase
      .from('member_points')
      .select('current_balance')
      .eq('member_id', member.id)
      .maybeSingle()

    setMyBalance(data?.current_balance ?? 0)
  }

  async function fetchMyTransactions() {
    const { data, error } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error && data) {
      setMyTransactions(data)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setCurrentMember(null)
  }

  return (
    <div className="space-y-5">
      <section className="pt-2">
        <p className="text-[22px] font-extrabold">나의 익쏘</p>
        <p className="mt-1 text-[14px] text-[#777]">
          {member.nickname}님의 포인트와 회원 정보를 확인합니다.
        </p>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold text-[#777]">회원 정보</p>
            <p className="mt-1 text-[22px] font-extrabold">
              {member.nickname} {isAdmin && <span title="관리자">👑</span>}
            </p>
            {member.real_name && (
              <p className="mt-1 text-[13px] font-semibold text-[#777]">{member.real_name}</p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full bg-[#f1efec] px-4 py-2 text-[13px] font-bold text-[#555]"
          >
            로그아웃
          </button>
        </div>
      </section>

      {isAdmin && (
        <button
          onClick={openAdminPage}
          className="w-full rounded-[20px] bg-[#252525] py-4 text-[16px] font-extrabold text-white shadow-sm"
        >
          관리자 페이지 접속 👑
        </button>
      )}

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[15px] font-bold">익쏘 pay</p>
        <p className="mt-4 text-[34px] font-extrabold text-[#c85b70]">
          {myBalance.toLocaleString()}P
        </p>
        <button className="mt-5 w-full rounded-[20px] bg-[#c85b70] py-4 text-[15px] font-extrabold text-white">
          포인트 충전 요청
        </button>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[15px] font-bold">포인트 이용 내역</p>
        <div className="mt-4 space-y-2">
          {myTransactions.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between rounded-xl bg-[#f7f5f2] px-3 py-2 text-[13px]"
            >
              <div>
                <p className="font-bold">
                  {tx.type === 'charge' ? '충전' : tx.type === 'use' ? '차감' : '조정'}
                </p>
                <p className="text-[12px] text-[#777]">
                  {tx.memo || '메모 없음'}
                  {tx.attend_date_snapshot ? ` · ${tx.attend_date_snapshot}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-extrabold">
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}P
                </p>
                <p className="text-[12px] text-[#777]">
                  잔액 {tx.balance_after.toLocaleString()}P
                </p>
              </div>
            </div>
          ))}

          {myTransactions.length === 0 && (
            <p className="rounded-xl bg-[#f7f5f2] py-4 text-center text-[13px] text-[#777]">
              포인트 내역이 없습니다.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[15px] font-bold">월회원 상태</p>
        <div className="mt-4 rounded-2xl bg-[#f1efec] px-4 py-4 text-[14px] font-semibold text-[#555]">
          월회원 정보는 다음 단계에서 연결됩니다.
        </div>
      </section>
    </div>
  )
}

function AdminScreen(props: {
  goBack: () => void
  currentMember: Member
  monthlyMonthKey: string
  setMonthlyMonthKey: (monthKey: string) => void
  refreshHomeMonthlyMembers: () => void
}) {
  const { goBack, currentMember, monthlyMonthKey, setMonthlyMonthKey, refreshHomeMonthlyMembers } = props
  const [adminLoginId, setAdminLoginId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [memberKeyword, setMemberKeyword] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [selectedBalance, setSelectedBalance] = useState(0)
  const [pointAmount, setPointAmount] = useState('')
  const [pointMemo, setPointMemo] = useState('')
  const [transactions, setTransactions] = useState<PointTransaction[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [monthlyMemberships, setMonthlyMemberships] = useState<MonthlyMembership[]>([])
  const [membershipType, setMembershipType] = useState<'boardgame' | 'mahjong'>('boardgame')
  const [pendingAttendances, setPendingAttendances] = useState<Attendance[]>([])
  const [mahjongRows, setMahjongRows] = useState<MahjongSettlementRow[]>([])
  const [mahjongUnmatched, setMahjongUnmatched] = useState<string[]>([])
  const [mahjongPaymentType, setMahjongPaymentType] = useState<'포인트' | '계좌이체'>('포인트')
  const [mahjongLoading, setMahjongLoading] = useState(false)

  useEffect(() => {
    fetchMembersForAdmin()
    fetchPendingAttendances()
  }, [])

  useEffect(() => {
    fetchMonthlyMemberships()
  }, [monthlyMonthKey])

  useEffect(() => {
    if (selectedMember) {
      fetchSelectedPoint(selectedMember.id)
      fetchTransactions(selectedMember.id)
    }
  }, [selectedMember?.id])

  const filteredMembers = useMemo(() => {
    const keyword = memberKeyword.trim().toLowerCase()
    if (!keyword) return members.slice(0, 8)

    return members
      .filter((member) =>
        `${member.nickname} ${member.login_id ?? ''}`.toLowerCase().includes(keyword)
      )
      .slice(0, 8)
  }, [members, memberKeyword])

  const monthlyMembers = useMemo(() => {
    return monthlyMemberships
      .map((item) => item.members)
      .filter(Boolean) as Member[]
  }, [monthlyMemberships])

  const selectedMemberIsMonthly = useMemo(() => {
    if (!selectedMember) return false
    return monthlyMemberships.some((item) => item.member_id === selectedMember.id)
  }, [monthlyMemberships, selectedMember?.id])



  async function handleMahjongCsvUpload(file: File | null) {
    if (!file) return

    setMahjongLoading(true)

    try {
      const text = await file.text()
      const rows = parseCsvText(text)

      const gameMap = new Map<string, { date: string; nickname: string; gameCount: number }>()

      rows.forEach((row) => {
        const date = row['일시']?.slice(0, 10)
        if (!date) return

        ;['1위', '2위', '3위', '4위'].forEach((rankKey) => {
          const nickname = extractKmlNickname(row[rankKey])
          if (!nickname) return

          const key = `${date}__${nickname}`
          const prev = gameMap.get(key)

          if (prev) {
            prev.gameCount += 1
          } else {
            gameMap.set(key, { date, nickname, gameCount: 1 })
          }
        })
      })

      const monthKeys = Array.from(new Set(Array.from(gameMap.values()).map((item) => getMonthKey(item.date))))

      const { data: monthlyData, error: monthlyError } = await supabase
        .from('monthly_memberships')
        .select('member_id, month_key, status, membership_type')
        .in('month_key', monthKeys.length > 0 ? monthKeys : ['none'])
        .eq('status', 'active')
        .eq('membership_type', 'mahjong')

      if (monthlyError) {
        console.error(monthlyError)
        alert('마작통합 월회원 조회 중 오류가 발생했습니다.')
        setMahjongLoading(false)
        return
      }

      const mahjongMonthlySet = new Set(
        (monthlyData ?? []).map((item: any) => `${item.month_key}__${item.member_id}`)
      )

      const nextRows: MahjongSettlementRow[] = []
      const unmatchedSet = new Set<string>()

      Array.from(gameMap.values()).forEach((item) => {
        const member = members.find((m) => m.nickname === item.nickname)
        const weekend = isWeekendDate(item.date)
        const capFee = weekend ? 12000 : 9000
        const rawFee = item.gameCount * 4000
        const isMahjongMonthly = member
          ? mahjongMonthlySet.has(`${getMonthKey(item.date)}__${member.id}`)
          : false

        if (!member) {
          unmatchedSet.add(item.nickname)
        }

        nextRows.push({
          date: item.date,
          nickname: item.nickname,
          memberId: member?.id ?? null,
          gameCount: item.gameCount,
          rawFee,
          capFee,
          isWeekend: weekend,
          isMahjongMonthly,
          fee: isMahjongMonthly ? 0 : Math.min(rawFee, capFee),
          paymentType: isMahjongMonthly ? '월회원' : mahjongPaymentType,
          importKey: `kml:${item.date}:${item.nickname}`,
        })
      })

      nextRows.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        return a.nickname.localeCompare(b.nickname)
      })

      setMahjongRows(nextRows)
      setMahjongUnmatched(Array.from(unmatchedSet))

      if (nextRows.length === 0) {
        alert('CSV에서 정산할 마작 기록을 찾지 못했습니다.')
      }
    } catch (error) {
      console.error(error)
      alert('CSV 분석 중 오류가 발생했습니다.')
    }

    setMahjongLoading(false)
  }

  async function createMahjongPendingAttendances() {
    if (mahjongRows.length === 0) {
      alert('먼저 CSV를 업로드해주세요.')
      return
    }

    if (mahjongUnmatched.length > 0) {
      alert(`매칭되지 않은 닉네임이 있습니다: ${mahjongUnmatched.join(', ')}`)
      return
    }

    const importKeys = mahjongRows.map((row) => row.importKey)

    const { data: existingRows, error: existingError } = await supabase
      .from('attendance_logs')
      .select('import_key')
      .in('import_key', importKeys)

    if (existingError) {
      console.error(existingError)
      alert('기존 정산 데이터 확인 중 오류가 발생했습니다.')
      return
    }

    const existingKeySet = new Set((existingRows ?? []).map((row: any) => row.import_key))

    const insertRows = mahjongRows
      .filter((row) => !existingKeySet.has(row.importKey))
      .map((row) => ({
        member_id: row.memberId,
        nickname_snapshot: row.nickname,
        attend_date: row.date,
        payment_type: row.paymentType,
        payment_status: 'pending',
        payment_amount: row.fee,
        event_type: 'mahjong',
        import_source: 'kml_csv',
        import_key: row.importKey,
      }))

    if (insertRows.length === 0) {
      alert('이미 생성된 마작 정산 내역입니다.')
      return
    }

    const { error } = await supabase
      .from('attendance_logs')
      .insert(insertRows)

    if (error) {
      console.error(error)
      alert('확인 대기 리스트 생성에 실패했습니다.')
      return
    }

    alert(`${insertRows.length}건을 확인 대기 리스트로 생성했습니다.`)
    setMahjongRows([])
    setMahjongUnmatched([])
    fetchPendingAttendances()
  }

  async function fetchPendingAttendances() {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('payment_status', 'pending')
      .order('attend_date', { ascending: false })
      .order('checkin_time', { ascending: false })
      .limit(50)

    if (error) {
      console.error(error)
      return
    }

    setPendingAttendances(data ?? [])
  }

  async function confirmAttendancePayment(attendance: Attendance) {
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
          balance_after: balanceAfter,
          memo: `${getEventTypeLabel(attendance.event_type)} 참석 차감`,
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
          confirmed_by: currentMember.id,
          point_transaction_id: txData?.id ?? null,
        })
        .eq('id', attendance.id)

      if (attendanceError) {
        console.error(attendanceError)
        alert('참석 결제 확인 처리에 실패했습니다.')
        return
      }
    } else {
      const { error } = await supabase
        .from('attendance_logs')
        .update({
          payment_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: currentMember.id,
        })
        .eq('id', attendance.id)

      if (error) {
        console.error(error)
        alert('결제 확인 처리에 실패했습니다.')
        return
      }
    }

    alert('확인 완료 처리했습니다.')
    fetchPendingAttendances()
  }

  async function rejectAttendancePayment(attendance: Attendance) {
    const { error } = await supabase
      .from('attendance_logs')
      .update({
        payment_status: 'rejected',
        confirmed_at: new Date().toISOString(),
        confirmed_by: currentMember.id,
      })
      .eq('id', attendance.id)

    if (error) {
      console.error(error)
      alert('취소 처리에 실패했습니다.')
      return
    }

    alert('취소 처리했습니다.')
    fetchPendingAttendances()
  }

  async function fetchMembersForAdmin() {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .order('nickname', { ascending: true })

    if (error) {
      console.error(error)
      return
    }

    setMembers(data ?? [])
  }

  async function fetchSelectedPoint(memberId: string) {
    const { data } = await supabase
      .from('member_points')
      .select('current_balance')
      .eq('member_id', memberId)
      .maybeSingle()

    setSelectedBalance(data?.current_balance ?? 0)
  }

  async function fetchTransactions(memberId: string) {
    const { data, error } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      console.error(error)
      return
    }

    setTransactions(data ?? [])
  }

  async function registerAdmin() {
    const loginId = adminLoginId.trim()

    if (!loginId) {
      alert('관리자로 등록할 아이디를 입력해주세요.')
      return
    }

    const { error } = await supabase
      .from('members')
      .update({ role: 'admin' })
      .eq('login_id', loginId)

    if (error) {
      console.error(error)
      alert('관리자 등록에 실패했습니다.')
      return
    }

    alert('관리자로 등록했습니다.')
    setAdminLoginId('')
    fetchMembersForAdmin()
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

    setAdminLoading(true)

    const { error: walletError } = await supabase
      .from('member_points')
      .upsert({
        member_id: selectedMember.id,
        current_balance: balanceAfter,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'member_id' })

    if (walletError) {
      setAdminLoading(false)
      console.error(walletError)
      alert('포인트 잔액 반영에 실패했습니다.')
      return
    }

    const { error: txError } = await supabase
      .from('point_transactions')
      .insert({
        member_id: selectedMember.id,
        type,
        amount: signedAmount,
        balance_after: balanceAfter,
        memo: pointMemo.trim() || null,
      })

    setAdminLoading(false)

    if (txError) {
      console.error(txError)
      alert('포인트 이력 저장에 실패했습니다.')
      return
    }

    setSelectedBalance(balanceAfter)
    setPointAmount('')
    setPointMemo('')
    fetchTransactions(selectedMember.id)
    alert('포인트가 반영되었습니다.')
  }

  async function fetchMonthlyMemberships() {
    const { data, error } = await supabase
      .from('monthly_memberships')
      .select('id, member_id, month_key, status, membership_type, price, members(*)')
      .eq('month_key', monthlyMonthKey)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      setMonthlyMemberships([])
      return
    }

    setMonthlyMemberships((data ?? []) as MonthlyMembership[])
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
          price: getMembershipPrice(membershipType),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id,month_key' })

      if (error) {
        console.error(error)
        alert('월회원 등록에 실패했습니다.')
        return
      }

      alert(`${formatMonthLabel(monthlyMonthKey)} ${getMembershipTypeLabel(membershipType)}으로 등록했습니다.`)
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

      alert(`${formatMonthLabel(monthlyMonthKey)} 월회원에서 해제했습니다.`)
    }

    await fetchMonthlyMemberships()
    refreshHomeMonthlyMembers()
  }

  return (
    <div className="space-y-5">
      <section className="pt-2">
        <button
          onClick={goBack}
          className="mb-4 rounded-full bg-[#f1efec] px-4 py-2 text-[13px] font-bold text-[#555]"
        >
          ← 나의 익쏘로
        </button>
        <p className="text-[22px] font-extrabold">관리자 👑</p>
        <p className="mt-1 text-[14px] text-[#777]">
          포인트와 월회원 등록을 관리합니다.
        </p>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[18px] font-extrabold">마작 정산 CSV 업로드</p>
        <p className="mt-1 text-[13px] text-[#777]">
          KML CSV를 업로드하면 게임 수와 이용요금을 계산해 확인 대기 리스트로 생성합니다.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['포인트', '계좌이체'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setMahjongPaymentType(type)}
              className={
                mahjongPaymentType === type
                  ? 'rounded-2xl bg-[#252525] py-3 text-[13px] font-extrabold text-white'
                  : 'rounded-2xl bg-[#f1efec] py-3 text-[13px] font-extrabold text-[#555]'
              }
            >
              {type} 정산
            </button>
          ))}
        </div>

        <label className="mt-4 block cursor-pointer rounded-[18px] border border-dashed border-[#cfc8c2] bg-[#f7f5f2] px-4 py-5 text-center text-[14px] font-extrabold text-[#555]">
          {mahjongLoading ? '분석 중...' : 'CSV 파일 선택'}
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(event) => handleMahjongCsvUpload(event.target.files?.[0] ?? null)}
          />
        </label>

        {mahjongUnmatched.length > 0 && (
          <div className="mt-4 rounded-2xl bg-[#fff3d8] p-4">
            <p className="text-[14px] font-extrabold text-[#a66b00]">매칭 안됨</p>
            <p className="mt-2 text-[13px] font-semibold text-[#7a5200]">
              {mahjongUnmatched.join(', ')}
            </p>
            <p className="mt-2 text-[12px] text-[#7a5200]">
              KML 닉네임과 익쏘 회원 닉네임이 같아야 확인 대기 리스트를 만들 수 있습니다.
            </p>
          </div>
        )}

        {mahjongRows.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-extrabold">정산 미리보기</p>
              <p className="text-[13px] font-bold text-[#777]">{mahjongRows.length}명</p>
            </div>

            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {mahjongRows.map((row) => (
                <div key={row.importKey} className="rounded-2xl bg-[#f7f5f2] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-extrabold">
                        {row.nickname}
                        {!row.memberId && <span className="text-[#c85b70]"> · 매칭 안됨</span>}
                      </p>
                      <p className="mt-1 text-[12px] font-bold text-[#777]">
                        {row.date} · {row.gameCount}게임 · {row.isWeekend ? '주말' : '평일'}
                      </p>
                      <p className="mt-1 text-[12px] font-bold text-[#777]">
                        원요금 {row.rawFee.toLocaleString()}원 / 상한 {row.capFee.toLocaleString()}원
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[16px] font-extrabold text-[#c85b70]">
                        {row.fee.toLocaleString()}원
                      </p>
                      <p className="mt-1 text-[12px] font-bold text-[#777]">
                        {row.isMahjongMonthly ? '마작통합 월회원' : row.paymentType}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={createMahjongPendingAttendances}
              className="mt-3 w-full rounded-[20px] bg-[#c85b70] py-4 text-[15px] font-extrabold text-white"
            >
              확인 대기 리스트 생성
            </button>
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[18px] font-extrabold">결제 확인 대기</p>
          <button
            onClick={fetchPendingAttendances}
            className="rounded-full bg-[#f1efec] px-3 py-2 text-[12px] font-bold text-[#555]"
          >
            새로고침
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {pendingAttendances.map((attendance) => (
            <div key={attendance.id} className="rounded-2xl bg-[#f7f5f2] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[16px] font-extrabold">{attendance.nickname_snapshot}</p>
                  <p className="mt-1 text-[12px] font-bold text-[#777]">
                    {getEventTypeLabel(attendance.event_type)} · {attendance.attend_date}
                  </p>
                  <p className="mt-1 text-[12px] font-bold text-[#777]">
                    {attendance.payment_type} · {(attendance.payment_amount ?? 0).toLocaleString()}원
                  </p>
                </div>
                <span className="rounded-full bg-[#fff3d8] px-3 py-1 text-[12px] font-bold text-[#a66b00]">
                  {getPaymentStatusLabel(attendance.payment_status)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => confirmAttendancePayment(attendance)}
                  className="rounded-2xl bg-[#c85b70] py-3 text-[13px] font-extrabold text-white"
                >
                  확인
                </button>
                <button
                  onClick={() => rejectAttendancePayment(attendance)}
                  className="rounded-2xl bg-[#777] py-3 text-[13px] font-extrabold text-white"
                >
                  취소
                </button>
              </div>
            </div>
          ))}

          {pendingAttendances.length === 0 && (
            <p className="rounded-2xl bg-[#f7f5f2] py-6 text-center text-[14px] font-semibold text-[#999]">
              확인 대기 중인 참석자가 없습니다.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[18px] font-extrabold">회원 선택</p>
        <p className="mt-1 text-[13px] text-[#777]">
          포인트 관리와 월회원 관리를 할 회원을 선택하세요.
        </p>

        <input
          value={memberKeyword}
          onChange={(event) => {
            setMemberKeyword(event.target.value)
            setSelectedMember(null)
          }}
          placeholder="회원 닉네임 또는 아이디 검색"
          className="mt-4 w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-3 text-[15px] outline-none focus:border-[#c85b70]"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {filteredMembers.map((member) => {
            const active = selectedMember?.id === member.id

            return (
              <button
                key={member.id}
                onClick={() => {
                  setSelectedMember(member)
                  setMemberKeyword(member.nickname)
                }}
                className={
                  active
                    ? 'rounded-full bg-[#c85b70] px-3 py-2 text-[13px] font-bold text-white'
                    : 'rounded-full bg-[#f1efec] px-3 py-2 text-[13px] font-semibold text-[#555]'
                }
              >
                {member.nickname}
                {monthlyMemberships.some((item) => item.member_id === member.id) ? ' · 월회원' : ''}
              </button>
            )
          })}
        </div>

        {selectedMember && (
          <div className="mt-4 rounded-2xl bg-[#f7f5f2] p-4">
            <p className="text-[13px] font-bold text-[#777]">선택 회원</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[20px] font-extrabold">{selectedMember.nickname}</p>
              <span
                className={
                  selectedMemberIsMonthly
                    ? 'rounded-full bg-[#b985df] px-3 py-1 text-[12px] font-bold text-white'
                    : 'rounded-full bg-[#e3dfda] px-3 py-1 text-[12px] font-bold text-[#777]'
                }
              >
                {selectedMemberIsMonthly ? '월회원' : '일반회원'}
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[18px] font-extrabold">포인트 관리</p>

        {selectedMember ? (
          <div className="mt-4">
            <div className="rounded-2xl bg-[#f7f5f2] p-4">
              <p className="text-[13px] font-bold text-[#777]">현재 포인트</p>
              <p className="mt-1 text-[30px] font-extrabold text-[#c85b70]">
                {selectedBalance.toLocaleString()}P
              </p>
            </div>

            <input
              value={pointAmount}
              onChange={(event) => setPointAmount(event.target.value)}
              placeholder="포인트 금액"
              inputMode="numeric"
              className="mt-4 w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-3 text-[15px] outline-none focus:border-[#c85b70]"
            />

            <input
              value={pointMemo}
              onChange={(event) => setPointMemo(event.target.value)}
              placeholder="메모 예: 포인트 충전, 참석 차감"
              className="mt-3 w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-3 text-[15px] outline-none focus:border-[#c85b70]"
            />

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                onClick={() => changePoint('charge')}
                disabled={adminLoading}
                className="rounded-2xl bg-[#1687bd] py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                충전
              </button>
              <button
                onClick={() => changePoint('use')}
                disabled={adminLoading}
                className="rounded-2xl bg-[#c85b70] py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                차감
              </button>
              <button
                onClick={() => changePoint('adjust')}
                disabled={adminLoading}
                className="rounded-2xl bg-[#73998c] py-3 text-[13px] font-extrabold text-white disabled:opacity-60"
              >
                조정
              </button>
            </div>

            <div className="mt-5">
              <p className="text-[14px] font-extrabold">최근 포인트 이력</p>
              <div className="mt-3 space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-xl bg-[#f7f5f2] px-3 py-2 text-[13px]"
                  >
                    <div>
                      <p className="font-bold">
                        {tx.type === 'charge' ? '충전' : tx.type === 'use' ? '차감' : '조정'}
                      </p>
                      <p className="text-[12px] text-[#777]">{tx.memo || '메모 없음'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold">
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}P
                      </p>
                      <p className="text-[12px] text-[#777]">
                        잔액 {tx.balance_after.toLocaleString()}P
                      </p>
                    </div>
                  </div>
                ))}

                {transactions.length === 0 && (
                  <p className="rounded-xl bg-[#f7f5f2] py-4 text-center text-[13px] text-[#777]">
                    포인트 이력이 없습니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-[#f7f5f2] py-6 text-center text-[14px] font-semibold text-[#999]">
            먼저 회원을 선택해주세요.
          </p>
        )}
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[18px] font-extrabold">월회원 등록 관리</p>

        <div className="mt-4 rounded-2xl bg-[#f7f5f2] p-4">
          <p className="text-[13px] font-bold text-[#777]">적용 월</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={() => setMonthlyMonthKey(moveMonth(monthlyMonthKey, -1))}
              className="rounded-full bg-white px-4 py-2 text-[18px] font-extrabold text-[#777]"
            >
              ‹
            </button>
            <p className="text-[20px] font-extrabold text-[#c85b70]">
              {formatMonthLabel(monthlyMonthKey)}
            </p>
            <button
              onClick={() => setMonthlyMonthKey(moveMonth(monthlyMonthKey, 1))}
              className="rounded-full bg-white px-4 py-2 text-[18px] font-extrabold text-[#777]"
            >
              ›
            </button>
          </div>
          <p className="mt-2 text-[12px] font-semibold text-[#777]">
            월회원 등록은 선택한 월에만 적용됩니다. 다음 달에는 자동으로 표시되지 않습니다.
          </p>
        </div>

        {selectedMember ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl bg-[#f7f5f2] p-4">
              <p className="text-[13px] font-bold text-[#777]">현재 상태</p>
              <p className="mt-1 text-[22px] font-extrabold">
                {selectedMemberIsMonthly ? `${formatMonthLabel(monthlyMonthKey)} 월회원 이용중` : `${formatMonthLabel(monthlyMonthKey)} 일반회원`}
              </p>
            </div>

            <div className="rounded-2xl bg-[#f7f5f2] p-4">
              <p className="text-[13px] font-bold text-[#777]">월회원 종류</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMembershipType('boardgame')}
                  className={
                    membershipType === 'boardgame'
                      ? 'rounded-2xl bg-[#c85b70] py-3 text-[13px] font-extrabold text-white'
                      : 'rounded-2xl bg-white py-3 text-[13px] font-extrabold text-[#555]'
                  }
                >
                  일반 보드게임<br />45,000원
                </button>
                <button
                  onClick={() => setMembershipType('mahjong')}
                  className={
                    membershipType === 'mahjong'
                      ? 'rounded-2xl bg-[#252525] py-3 text-[13px] font-extrabold text-white'
                      : 'rounded-2xl bg-white py-3 text-[13px] font-extrabold text-[#555]'
                  }
                >
                  마작통합<br />55,000원
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateMonthlyStatus(true)}
                className="rounded-2xl bg-[#b985df] py-3 text-[13px] font-extrabold text-white"
              >
                월회원 등록
              </button>
              <button
                onClick={() => updateMonthlyStatus(false)}
                className="rounded-2xl bg-[#777] py-3 text-[13px] font-extrabold text-white"
              >
                월회원 해제
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-[#f7f5f2] py-6 text-center text-[14px] font-semibold text-[#999]">
            먼저 회원을 선택해주세요.
          </p>
        )}

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-extrabold">{formatMonthLabel(monthlyMonthKey)} 월회원</p>
            <span className="rounded-full bg-[#f1e8e6] px-3 py-1 text-[12px] font-bold text-[#c85b70]">
              {monthlyMembers.length}명
            </span>
          </div>

          {monthlyMemberships.length > 0 ? (
            <div className="mt-3 space-y-2">
              {monthlyMemberships.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-[#f7f5f2] px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13px] font-extrabold text-[#444]">
                      {item.members?.nickname}
                    </p>
                    <p className="shrink-0 text-[12px] font-bold text-[#c85b70]">
                      {(item.price ?? 0).toLocaleString()}원
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-[#777]">
                    {getMembershipTypeLabel(item.membership_type)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 rounded-2xl bg-[#f7f5f2] py-5 text-center text-[14px] font-semibold text-[#999]">
              등록된 월회원이 없습니다.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-[#d7d0ca] bg-white p-5 shadow-sm">
        <p className="text-[18px] font-extrabold">관리자 등록</p>
        <input
          value={adminLoginId}
          onChange={(event) => setAdminLoginId(event.target.value)}
          placeholder="관리자로 지정할 아이디"
          className="mt-4 w-full rounded-2xl border border-[#ddd6d0] bg-[#faf8f6] px-4 py-3 text-[15px] outline-none focus:border-[#c85b70]"
        />
        <button
          onClick={registerAdmin}
          className="mt-3 w-full rounded-[18px] bg-[#252525] py-3 text-[14px] font-extrabold text-white"
        >
          관리자로 등록
        </button>
      </section>
    </div>
  )
}
function BottomTabs(props: {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
}) {
  const { activeTab, setActiveTab } = props

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'home', label: '홈', icon: '🏠' },
    { key: 'meeting', label: '모임', icon: '👥' },
    { key: 'my', label: '나의 익쏘', icon: '👤' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-[#ded8d2] bg-white">
      <div className="mx-auto grid h-[68px] max-w-[430px] grid-cols-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.key

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex flex-col items-center justify-center gap-1"
            >
              <span className={active ? 'text-[22px]' : 'text-[21px] opacity-45'}>
                {tab.icon}
              </span>
              <span
                className={
                  active
                    ? 'text-[12px] font-extrabold text-[#c85b70]'
                    : 'text-[12px] font-bold text-[#9b9b9b]'
                }
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
