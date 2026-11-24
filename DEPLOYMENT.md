# bpocrm · Supabase와 Vercel 연결

이 버전은 Supabase Auth와 workspace를 사용하지 않는다. 회원가입 계정은 `public.users`, 로그인 세션은 `public.app_sessions`에 저장하며 Vercel API가 데이터베이스 접근을 중계한다. 브라우저에는 Supabase Secret key를 전달하지 않는다.

## 운영 중인 Supabase 프로젝트 업데이트

1. 기존 CRM 데이터베이스를 백업한다.
2. Supabase 프로젝트의 **SQL Editor → New query**를 연다. 아래 파일을 순서대로 열고, 이미 적용된 파일은 건너뛴다. 각 파일의 전체 내용을 붙여 넣고 **Run**을 실행한다.

   1. [20261124000000_company_contact_lifecycle.sql](supabase/migrations/20261124000000_company_contact_lifecycle.sql)
   2. [20261124010000_lost_leads.sql](supabase/migrations/20261124010000_lost_leads.sql)
   3. [20261124020000_directory_notes.sql](supabase/migrations/20261124020000_directory_notes.sql)

   위 파일은 기존 로그인과 `20261123030000_fast_snapshot_and_concurrency.sql`이 적용된 DB를 대상으로 한다.
3. 같은 SQL Editor에서 아래 쿼리로 적용 결과를 확인한다.

   ```sql
   select
     (select count(*) from public.companies) as companies,
     (select count(*) from public.contacts) as contacts,
     (select count(*) from public.leads where contact_id is null) as leads_without_contact,
     (select label from public.lead_stages where is_won) as won_stage,
     (select label from public.lead_stages where code = 'lost') as lost_stage;
   ```

   `won_stage`에는 `수주`가 표시된다. 기존 리드에서 기업을 만들고 이름이나 이메일을 확인할 수 있는 담당자를 연결한다. 담당자 식별 정보가 없는 리드도 기업과 리드 이력을 유지한다. 기존 `계약` 단계에서 이미 수주한 건은 리드 상세에서 `수주`로 변경한다.
4. Vercel의 **Deployments** 탭에서 최신 `main` 커밋의 Production 배포를 확인한다. 이미 배포됐다면 SQL 적용 후 CRM 화면을 새로고침한다.

## 1. 초기 스키마에서 새로 설치하는 경우

기존 초기 스키마를 적용한 Supabase 프로젝트의 SQL Editor에서 아래 파일 전체를 실행한다.

`supabase/migrations/20261123020000_single_tenant_custom_login.sql`

그 다음 아래 성능·동시 수정 마이그레이션도 실행한다.

`supabase/migrations/20261123030000_fast_snapshot_and_concurrency.sql`

두 번째 마이그레이션은 최초 화면 조회를 DB 함수 한 번으로 합치고, 각 업무·리드·문의·템플릿에 레코드 버전을 추가한다. 같은 항목을 동시에 편집하면 먼저 저장된 변경을 유지하고 늦은 저장 요청에는 충돌을 반환한다.

20261123020000 마이그레이션은 목업 단계의 workspace 기반 테이블을 삭제하고 단일 CRM 테이블로 다시 만든다. 기존 테이블에 넣은 데이터가 있다면 실행 전에 백업한다. 마이그레이션에는 다음 항목이 포함된다.

- `users`와 `app_sessions`
- 리드, 업무, 활동, 문의 메일, 개인 템플릿과 초안
- 기본 리드 단계 네 개
- 회원가입, 로그인, 로그아웃, 비밀번호 변경용 DB 함수
- 브라우저 직접 접근 차단과 Vercel 서버 전용 권한

이전의 `20261123010000_crm_password_setup.sql`은 실행하지 않는다.

마지막으로 [기업·담당자 관리 마이그레이션](supabase/migrations/20261124000000_company_contact_lifecycle.sql), [로스트 마이그레이션](supabase/migrations/20261124010000_lost_leads.sql), [비고·로스트 메모 마이그레이션](supabase/migrations/20261124020000_directory_notes.sql)을 순서대로 실행한다.

## 2. Vercel 빌드 설정

Vercel 프로젝트의 **Settings → Build and Deployment**에서 아래 값을 사용한다.

| 항목 | 값 |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | `Vite` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production Branch | `main` |

## 3. Vercel 환경변수

Supabase Dashboard의 **Connect** 또는 **Project Settings → API Keys**에서 Project URL과 Secret key를 확인한다. Vercel 프로젝트의 **Settings → Environment Variables**에 아래 세 값을 Production 환경으로 등록한다.

```dotenv
VITE_CRM_MODE=server
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
```

`SUPABASE_SECRET_KEY`는 Vercel 서버 함수에서만 읽는다. 이름에 `VITE_`를 붙이지 않으며 GitHub에 올리지 않는다. 환경변수를 저장한 뒤 Production을 재배포한다.

## 4. 최초 사용자 가입

배포 주소를 열고 **처음 사용하시나요? 회원가입**을 선택한다. 각 사용자가 이름, 사용자명, 비밀번호를 입력하면 계정이 생성되고 바로 로그인된다.

권장 사용자명은 다음과 같다.

| 이름 | 사용자명 |
| --- | --- |
| 윤혁진 | `yoonhj` |
| 임경태 | `limgtae` |
| 정범준 | `jungbj` |
| 이남원 | `leenamwon` |

사용자명은 영문 소문자, 숫자, 하이픈, 밑줄을 조합한 4~32자다. 비밀번호는 8자 이상이다. 가입 이후에는 사용자명과 비밀번호로 로그인하며 마이페이지에서 비밀번호를 변경할 수 있다.

현재 회원가입은 배포 주소에 접근한 누구에게나 열려 있다. 네 명의 가입이 끝난 뒤 공개 가입을 닫으려면 Vercel 환경변수로 가입 허용 여부를 제어하는 설정을 추가할 수 있다.

서버 연동 상태를 로컬에서 확인할 때는 일반 Vite 개발 서버 대신 `frontend` 폴더에서 `vercel dev`를 실행한다. 환경변수를 생략한 `npm run dev`는 기존 브라우저 데모 모드로 사용할 수 있다.

## 5. 배포 확인

1. 시크릿 창에서 회원가입 후 CRM 홈이 열리는지 확인한다.
2. 로그아웃 후 같은 사용자명과 비밀번호로 다시 로그인한다.
3. 두 계정으로 각각 로그인해 공용 리드와 업무가 함께 보이는지 확인한다.
4. 개인 메일 템플릿과 초안은 작성한 계정에만 표시되는지 확인한다.
5. 마이페이지에서 비밀번호를 변경한 뒤 새 비밀번호로 다시 로그인한다.
6. 문의 메일을 기업·담당자에 연결하고, 담당자 타임라인에서 메일과 접촉 이력을 확인한다.
7. 담당자에서 리드를 등록하고 영업 단계를 `수주`로 변경한 뒤 `고객사 관리`에서 기업과 수주 리드를 확인한다.

## 6. 공용 메일 자동 수신

운영에서 공용 메일을 자동으로 쌓으려면 Vercel 서버 전용 환경변수 `MAIL_INGEST_TOKEN`에 충분히 긴 무작위 값을 등록하고 재배포한다. 메일 공급자나 연동 워크플로가 새 수신 메일마다 아래 요청을 보내도록 설정한다.

```http
POST /api?action=mail-ingest
Authorization: Bearer <MAIL_INGEST_TOKEN>
Content-Type: application/json
```

```json
{
  "mailbox": "sales@example.com",
  "messageId": "provider-stable-message-id",
  "threadId": "provider-thread-id",
  "senderName": "홍길동",
  "senderEmail": "contact@example.org",
  "companyName": "예시기업",
  "subject": "제품 도입 문의",
  "body": "데모 일정과 견적을 문의합니다.",
  "receivedAt": "2026-11-24T10:00:00+09:00"
}
```

`mailbox`, `messageId`, `senderEmail`, `receivedAt`은 필수다. 메일 본문은 일반 텍스트로 전달한다. 같은 사서함과 `messageId`를 사용한 재전송은 기존 메일을 유지하고 성공으로 응답한다. 새 메일은 문의함에 검토 대기로 쌓인다.
