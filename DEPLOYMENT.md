# 세일즈맨 배포 및 데이터 연동

현재 앱은 `frontend/`의 React·TypeScript·Vite 목업이다. 샘플 데이터와 변경 사항은 브라우저에 저장한다. GitHub와 Vercel을 먼저 연결하면 이 목업을 배포할 수 있다. 이후 Supabase 스키마를 적용하고 앱의 데이터 접근 코드를 연결하면 로그인한 팀원끼리 데이터를 공유할 수 있다.

## 1. GitHub에 올리기

GitHub에서 팀이 사용할 비공개 저장소를 만든다. 기존 파일을 첫 커밋으로 올릴 수 있도록 저장소 생성 화면의 README, 라이선스, .gitignore 초기화는 선택을 해제한다. [GitHub 기존 코드 올리기](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

PowerShell에서 프로젝트 루트로 이동한다. 이 작업 폴더에는 아직 Git 저장소가 없다.

```powershell
Set-Location 'D:/KwangwoonUniv/Salesman'
git init -b main
git add -- .gitignore DESIGN_SYSTEM.md IA.md DEPLOYMENT.md frontend supabase
git diff --cached --stat
git diff --cached --name-only
git commit -m "Initialize Salesman CRM"
git remote add origin https://github.com/OWNER/salesman-crm.git
git push -u origin main
```

- `OWNER/salesman-crm`을 실제 계정 또는 조직과 저장소 이름으로 바꾼다.
- 커밋 전 파일 목록에서 앱 소스와 `frontend/package-lock.json`, SQL 마이그레이션이 포함됐는지 확인한다. `node_modules`, `dist`, `.env.local`과 실제 고객 데이터는 올리지 않는다.
- 첫 push가 끝나면 GitHub에서 `main` 브랜치와 두 디렉터리 `frontend/`, `supabase/`를 확인한다.

## 2. Vercel에 목업 배포

Vercel에서 **Add New → Project**를 선택하고 GitHub 저장소를 가져온다. 생성 화면에서 다음 값을 확인하고 **Deploy**를 누른다. [Vercel Git 배포](https://vercel.com/docs/git) · [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build)

| 항목 | 값 |
| --- | --- |
| Production Branch | `main` |
| Root Directory | `frontend` |
| Framework Preset | `Vite` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | 자동 감지 |

배포 주소에서 홈 → 문의함 → 리드 → 업무가 열리는지 확인한다. 현재 주소는 `/#/work` 같은 해시 라우팅을 사용하므로 현재 방식에서는 별도 SPA rewrite 설정이 필요 없다. 첫 배포는 가상 데이터로 시연한다. GitHub 저장소의 공개 범위와 Vercel 배포 주소의 접근 범위는 각각 설정한다. 실제 영업 업무에 사용할 때는 Vercel의 사용 조건과 배포 접근 제어를 확인한다. Hobby 플랜은 개인 비상업 용도다. [Vite 배포 가이드](https://vercel.com/docs/frameworks/frontend/vite) · [Vercel Hobby 플랜](https://vercel.com/docs/plans/hobby)

## 3. Supabase 테이블과 데이터 관계

| 테이블 | 역할 | 접근 범위 |
| --- | --- | --- |
| `workspaces` | 영업팀 단위 | 소속 팀원 조회 |
| `workspace_members` | Supabase Auth 사용자, 팀 소속, 표시 이름과 활성 여부 | 소속 팀원 조회, 초기 등록은 운영자 |
| `user_settings` | 개인 업무용 발신 주소 | 본인 |
| `lead_stages` | 팀별 영업 단계 이름, 코드, 표시 순서 | 소속 팀원 조회, 단계 관리는 운영자 |
| `leads` | 고객사, 담당자, 규모, 예상 사용 인원, 희망 서비스, 도입 목적, 영업 단계와 책임자 | 소속 팀원 |
| `tasks` | 후속 업무, 담당자, 상태, 기한 | 소속 팀원 |
| `lead_activities` | 통화·미팅·메모와 영업 단계 변경 이력 | 소속 팀원 |
| `mail_connections` | 메일 제공자, 공용 메일함, 동기화 상태와 마지막 성공 시각 | 팀원 조회, 서버가 갱신 |
| `inbound_emails` | 공용 문의 메일, 수신 시각, 원문 텍스트, 처리 제외 여부, 연결된 리드 | 소속 팀원, 메일 수집은 서버 |
| `mail_templates` | 개인 메일 템플릿의 이름, 제목, 본문 | 본인 |
| `mail_drafts` | 개인이 작성한 메일 초안과 관련 리드 | 본인 |

계정은 Supabase가 관리하는 `auth.users`를 참조한다. 고객 정보는 현재 화면의 리드 단위로 저장한다. 향후 같은 고객사의 여러 리드에서 정보를 공유해야 할 때 고객사 테이블 분리를 검토한다.

- 영업 단계는 `lead_stages.sort_order`로 정렬한다. 기존 단계 ID를 유지하며 여섯 단계로 확장할 수 있다.
- 팀 간에 다른 팀의 담당자나 리드를 연결하지 못하도록 복합 외래 키를 둔다.
- 문의 상태는 `lead_id`와 `is_excluded`로 계산한다. `register_lead_from_email` RPC는 메일을 잠그고 리드 생성과 연결을 한 트랜잭션으로 처리한다. 같은 요청을 다시 처리하면 이미 연결된 리드 ID를 반환한다.
- 메일함과 제공자 메시지 ID의 조합으로 중복 수집을 막는다. 영업 단계가 변경되면 DB 트리거가 활동 이력을 남긴다.
- 업무 삭제는 현재 화면의 동작에 맞춰 확정 후 해당 행을 삭제한다. 공용 메일 연결에는 OAuth 토큰을 넣지 않는다.

## 4. Supabase에 초기 DDL 적용

[초기 마이그레이션](supabase/migrations/20261123000000_initial_crm.sql)은 새 Supabase 프로젝트에 적용한다. 우선 개발 프로젝트에서 Auth와 RLS 정책을 검증한다. RLS는 로그인한 사용자의 팀 소속과 개인 자료 소유권을 행 단위로 확인한다. [Supabase 마이그레이션](https://supabase.com/docs/guides/local-development/database-migrations) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

프로젝트 루트에서 다음 명령을 실행한다. CLI가 묻는 인증 정보는 해당 입력에만 사용한다. [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) · [로컬과 호스팅 대상 지정](https://supabase.com/docs/guides/local-development/local-and-hosted-projects)

```powershell
npx.cmd supabase init
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push --dry-run --remote
npx.cmd supabase db push --remote
npx.cmd supabase migration list --remote
```

이미 `supabase/config.toml`이 있으면 `init`은 건너뛴다. SQL Editor에서 마이그레이션 본문을 수동 실행하는 방식은 CLI의 마이그레이션 이력을 남기지 않으므로, 위 CLI 흐름을 사용하는 경우 SQL Editor에는 아래 팀 초기화 SQL만 실행한다. [Supabase CLI 워크플로](https://supabase.com/docs/guides/local-development/cli-workflows)

### 팀원과 기본 영업 단계 등록

Supabase Auth에 개발용 팀원 계정 3개를 만들고 각 사용자의 UUID를 확인한다. 초대나 비밀번호 재설정에 이메일을 사용한다면 사이트 주소와 허용 리디렉트 주소를 설정한다. 실제 팀원에게 메일을 보내기 전에 Auth의 커스텀 SMTP 설정을 확인한다. 기본 SMTP는 프로젝트 팀에 속한 메일 주소에만 보낸다. [Supabase 사용자 관리](https://supabase.com/docs/guides/auth/users) · [리디렉트 URL](https://supabase.com/docs/guides/auth/redirect-urls) · [커스텀 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

SQL Editor에서 아래 예시의 UUID 3개와 표시 이름을 실제 값으로 바꾼 뒤, 팀을 처음 만들 때 한 번 실행한다.

```sql
do $$
declare
  new_workspace uuid;
begin
  insert into public.workspaces (name) values ('영업팀')
  returning id into new_workspace;

  insert into public.workspace_members (workspace_id, user_id, display_name, role)
  values
    (new_workspace, 'ADMIN_AUTH_USER_UUID'::uuid, '관리자 이름', 'admin'),
    (new_workspace, 'MEMBER_1_AUTH_USER_UUID'::uuid, '팀원 1 이름', 'member'),
    (new_workspace, 'MEMBER_2_AUTH_USER_UUID'::uuid, '팀원 2 이름', 'member');

  insert into public.lead_stages (workspace_id, code, label, sort_order)
  values
    (new_workspace, 'new', '신규', 10),
    (new_workspace, 'consultation', '상담', 20),
    (new_workspace, 'proposal', '제안', 30),
    (new_workspace, 'contract', '계약', 40);
end
$$;
```

현재 정책에서 `admin`은 운영자 구분용 값이다. 팀원 추가·비활성화와 영업 단계 변경은 초기 운영자가 SQL로 관리한다. 이후 해당 관리 화면을 도입할 때 권한 정책을 함께 구현한다.

## 5. 프런트엔드를 Supabase와 연결

1. `frontend/`에서 `npm.cmd install @supabase/supabase-js`를 실행한다.
2. 프로젝트 **Connect** 화면의 Project URL과 Publishable key를 `frontend/.env.local`에 설정한다. 같은 이름으로 Vercel **Settings → Environment Variables**에 등록하고 해당 환경을 다시 배포한다. 운영과 Preview는 각각 연결할 DB를 확인한다. [Supabase React 가이드](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) · [Vercel 환경 변수](https://vercel.com/docs/environment-variables)
3. Supabase Auth로 로그인한 사용자와 `workspace_members`에서 현재 팀을 찾는다. 지금의 가상 팀원 전환을 실제 로그인으로 교체한다.
4. `frontend/src/data/`에 Supabase 데이터 접근 코드를 만들고 `frontend/src/app/model.ts`의 읽기·쓰기 동작을 연결한다. DB 상태값 `pending`, `in_progress`, `completed`는 UI의 ‘대기’, ‘진행 중’, ‘완료’에 매핑한다. 리드 단계는 `lead_stages`를 조회해 표시한다.
5. 메일 제공자를 확정한 뒤 서버 함수 또는 작업으로 공용 메일을 가져온다. 수집은 `inbound_emails`에 중복 방지 키로 저장하고, 화면에서 새 리드를 만들 때 `register_lead_from_email`을 호출한다. 이 단계에서 실제 메일 권한과 고객 정보 보관 범위를 확정한다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Vite의 `VITE_*` 값은 브라우저에 포함된다. Publishable key는 브라우저 용도이고, Secret key와 기존 `service_role` 키는 서버에만 둔다. 메일 OAuth 토큰과 갱신 정보도 서버에서 관리한다. [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys) · [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

## 첫 실데이터 연결 전 확인

- 같은 팀의 두 계정에서 동일한 리드와 업무가 보이고, 서로 다른 계정의 개인 초안·템플릿은 보이지 않는지 확인한다.
- 팀 소속이 없는 계정과 로그아웃 상태에서는 공유 데이터에 접근할 수 없는지 확인한다.
- 한 문의를 연속 등록해도 리드 한 건만 생성되고, 단계 변경과 업무 배정·완료·삭제가 두 계정에서 일치하는지 확인한다.
- 기존 목업 데이터는 브라우저에 남아 있다. 실제로 옮길 자료가 있다면 대상 레코드를 확인하고 별도 이관한다.
