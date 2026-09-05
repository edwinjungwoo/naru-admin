# Naru 어드민 대시보드

정적 페이지(`index.html` + `style.css` + `dashboard.js`, 빌드 없음). 공유 비밀번호를 넣으면 Supabase 엣지 함수 `admin-dashboard`가
서버에서 비밀번호를 확인하고 집계를 돌려준다. **이 레포에는 비밀이 없다** —
비밀번호는 Supabase 시크릿(`ADMIN_DASHBOARD_PASSWORD`)에만 있다.

원본은 Naru 레포의 `admin/`. 고칠 일이 있으면 거기서 고치고 여기로 복사한다.
비밀번호를 바꾸려면:

    supabase secrets set ADMIN_DASHBOARD_PASSWORD='새-비밀번호'
