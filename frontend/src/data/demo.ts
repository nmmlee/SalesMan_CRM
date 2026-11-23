import { dateKey, members, stages, type CRM, type Mail } from '../domain/crm'

export function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function incomingMail(): Mail {
  return {
    id: 'demo-incoming', company: '웨이브오피스', sender: '한소희', email: 'sohee@waveoffice.example',
    subject: '팀 협업 솔루션 도입 문의', receivedAt: new Date().toISOString(),
    body: '안녕하세요, 웨이브오피스 한소희입니다.\n\n30명 규모 팀에서 사용할 솔루션을 검토하고 있습니다. 제품 소개 자료와 데모 가능 일정을 공유해 주실 수 있을까요?\n\n감사합니다.\n한소희 드림',
  }
}

export function createDemoData(): CRM {
  return {
    members,
    stages: stages.map(label => ({ id: label, label })),
    activeMemberId: 'minji',
    profiles: { minji: 'minji@salesman.example', hyunwoo: '', seoyeon: '' },
    mailbox: { status: 'ready', lastSuccess: minutesAgo(12) },
    leads: [
      { id: 'l1', company: '루멘테크', contact: '정유진', email: 'yujin@lumen.example', title: '업무 관리 솔루션 도입', stage: '제안', ownerId: 'minji', summary: '영업팀 25명이 사용할 업무 관리 솔루션을 검토하고 있습니다. 데모 후 견적과 도입 일정을 공유할 예정입니다.' },
      { id: 'l2', company: '모노랩', contact: '최준호', email: 'junho@monolab.example', title: '팀 협업 도구 상담', stage: '상담', ownerId: 'hyunwoo', summary: '다음 달 신규 프로젝트에 맞춰 협업 도구를 도입하려고 합니다.' },
      { id: 'l3', company: '오르빗웍스', contact: '윤지수', email: 'jisu@orbit.example', title: '기술 연동 검토', stage: '신규', ownerId: 'seoyeon', summary: '기존 인사 시스템과의 연동 방식 및 권한 정책을 확인해야 합니다.' },
      { id: 'l4', company: '브릭스튜디오', contact: '송민정', email: 'minjeong@brick.example', title: '팀 계약 조건 확인', stage: '계약', ownerId: 'minji', summary: '시범 사용을 마쳤으며 계약 조건을 확인하고 있습니다.' },
    ],
    tasks: [
      { id: 't1', leadId: 'l1', title: '도입 견적서 검토 및 전달', assigneeId: 'minji', due: dateKey(-1), status: '진행 중' },
      { id: 't2', leadId: 'l2', title: '첫 상담 일정 확정', assigneeId: 'minji', due: dateKey(), status: '대기' },
      { id: 't3', leadId: 'l4', title: '계약 조건 확인 미팅', assigneeId: 'minji', due: dateKey(1), status: '진행 중' },
      { id: 't4', leadId: 'l1', title: '담당자에게 데모 후속 메일 작성', assigneeId: 'minji', due: dateKey(2), status: '대기' },
      { id: 't5', leadId: 'l3', title: '기존 시스템 연동 범위 정리', assigneeId: 'seoyeon', due: dateKey(1), status: '대기' },
      { id: 't6', leadId: 'l2', title: '상담 전 필요 기능 확인', assigneeId: 'hyunwoo', due: dateKey(2), status: '진행 중' },
      { id: 't7', leadId: 'l1', title: '제품 데모 진행', assigneeId: 'minji', due: dateKey(-3), status: '완료' },
    ],
    mails: [
      { id: 'm1', company: '스튜디오 파인', sender: '조아라', email: 'ara@studiofine.example', subject: '제품 도입 및 데모 일정 문의', receivedAt: minutesAgo(34), body: '안녕하세요, 스튜디오 파인 조아라입니다.\n\n팀 내 업무를 정리할 수 있는 솔루션을 찾아보고 있습니다. 15명 규모 기준 요금과 이번 주 가능한 데모 일정을 알려주실 수 있을까요?\n\n감사합니다.\n조아라 드림' },
      { id: 'm2', company: '넥스트리', sender: '문재현', email: 'jaehyun@nextree.example', subject: '기업용 요금제 문의드립니다', receivedAt: minutesAgo(86), body: '안녕하세요. 기업용 요금제와 사용자 40명 기준 예상 비용이 궁금합니다. 견적서를 받아볼 수 있을까요?' },
      { id: 'm3', company: '오르빗웍스', sender: '윤지수', email: 'jisu@orbit.example', subject: '기존 사내 시스템 연동 문의', receivedAt: minutesAgo(155), body: '안녕하세요. 사용 중인 인사 시스템과 연동 가능한지 확인 부탁드립니다. 가능하다면 지원 범위를 안내해 주세요.' },
      { id: 'm4', company: '루멘테크', sender: '정유진', email: 'yujin@lumen.example', subject: '제품 데모 이후 견적서 요청', receivedAt: minutesAgo(206), body: '안녕하세요. 데모에서 안내해 주신 플랜으로 견적서를 요청드립니다. 도입 가능한 일정도 알려주세요.', leadId: 'l1' },
      { id: 'm5', company: '모노랩', sender: '최준호', email: 'junho@monolab.example', subject: '팀 협업 도구 상담 문의', receivedAt: minutesAgo(590), body: '안녕하세요. 신규 프로젝트에서 쓸 솔루션을 검토합니다. 상담 가능 일정을 알려주세요.', leadId: 'l2' },
    ],
    activities: [
      { id: 'a1', leadId: 'l1', type: '통화', text: '정유진 담당자와 도입 일정과 견적 범위를 확인했습니다.', authorId: 'minji', at: minutesAgo(57) },
      { id: 'a2', leadId: 'l2', type: '미팅', text: '모노랩과 제품 소개 미팅을 진행했습니다.', authorId: 'hyunwoo', at: minutesAgo(138) },
      { id: 'a3', leadId: 'l3', type: '메모', text: '오르빗웍스에서 연동 관련 자료를 요청했습니다.', authorId: 'seoyeon', at: minutesAgo(268) },
    ],
    templates: [
      { id: 'tpl1', ownerId: 'minji', name: '첫 회신', subject: '{{고객사명}} 도입 문의 답변드립니다', body: '안녕하세요, {{담당자명}}님.\n\n도입 문의를 주셔서 감사합니다. 요청해 주신 내용에 대해 안내드립니다.\n\n감사합니다.\n{{내이름}} 드림' },
      { id: 'tpl2', ownerId: 'minji', name: '미팅 일정 제안', subject: '{{고객사명}} 미팅 일정 제안', body: '안녕하세요, {{담당자명}}님.\n\n제품 소개 미팅 일정을 조율하고자 합니다. 가능하신 시간대를 알려주시면 감사하겠습니다.\n\n{{내이름}} 드림' },
    ],
    drafts: [],
  }
}
