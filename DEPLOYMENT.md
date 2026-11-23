# 세일즈맨 CRM · Supabase와 Vercel 연결

이 버전은 Supabase Auth와 workspace를 사용하지 않는다. 회원가입 계정은 `public.users`, 로그인 세션은 `public.app_sessions`에 저장하며 Vercel API가 데이터베이스 접근을 중계한다. 브라우저에는 Supabase Secret key를 전달하지 않는다.

## 1. Supabase 테이블 교체

기존 초기 스키마를 적용한 Supabase 프로젝트의 SQL Editor에서 아래 파일 전체를 실행한다.

`supabase/migrations/20261123020000_single_tenant_custom_login.sql`

이 마이그레이션은 목업 단계의 workspace 기반 테이블을 삭제하고 단일 CRM 테이블로 다시 만든다. 기존 테이블에 넣은 데이터가 있다면 실행 전에 백업한다. 마이그레이션에는 다음 항목이 포함된다.

- `users`와 `app_sessions`
- 리드, 업무, 활동, 문의 메일, 개인 템플릿과 초안
- 기본 리드 단계 네 개
- 회원가입, 로그인, 로그아웃, 비밀번호 변경용 DB 함수
- 브라우저 직접 접근 차단과 Vercel 서버 전용 권한

이전의 `20261123010000_crm_password_setup.sql`은 실행하지 않는다.

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
