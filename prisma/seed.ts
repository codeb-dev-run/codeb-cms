import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. 사용자 생성 (관리자)
  let admin = await prisma.user.findUnique({
    where: { email: 'admin@codeb.kr' }
  });

  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin123!@#', 10);
    admin = await prisma.user.create({
      data: {
        email: 'admin@codeb.kr',
        username: 'admin',
        password: hashedPassword,
        name: '관리자',
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log('✅ Admin user created');
  } else {
    console.log('✅ Admin user already exists');
  }

  // 2. 메뉴(카테고리) 생성
  const menus = [
    { name: '주식', slug: 'stock', description: '주식 관련 정보와 토론', icon: '📈', order: 1 },
    { name: '코인', slug: 'coin', description: '암호화폐 정보와 토론', icon: '💰', order: 2 },
    { name: '알뜰구매', slug: 'shopping', description: '알뜰한 쇼핑 정보 공유', icon: '🛒', order: 3 },
    { name: '휴대폰', slug: 'mobile', description: '휴대폰 및 통신 정보', icon: '📱', order: 4 },
    { name: '부동산', slug: 'realestate', description: '부동산 정보와 상담', icon: '🏠', order: 5 },
    { name: '경매', slug: 'auction', description: '경매 정보와 노하우', icon: '🔨', order: 6 },
  ];

  const createdMenus = [];
  for (const menu of menus) {
    const created = await prisma.menu.upsert({
      where: { slug: menu.slug },
      update: {
        name: menu.name,
        description: menu.description,
        icon: menu.icon,
        order: menu.order,
        isActive: true,
      },
      create: {
        name: menu.name,
        slug: menu.slug,
        description: menu.description,
        icon: menu.icon,
        order: menu.order,
        isActive: true,
      },
    });
    createdMenus.push(created);
  }
  console.log('✅ Menus created');

  // 3. 각 메뉴별 샘플 게시글 생성
  const samplePosts = {
    stock: [
      { title: '삼성전자 실적 분석', content: '이번 분기 삼성전자 실적을 분석해보겠습니다...' },
      { title: '미국 증시 전망', content: '연준의 금리 인상이 미국 증시에 미치는 영향...' },
      { title: '배당주 추천 TOP 10', content: '안정적인 배당 수익을 위한 종목 추천...' },
      { title: 'ETF 투자 가이드', content: 'ETF 투자의 기초부터 실전까지...' },
      { title: '기술주 분석: NVIDIA', content: 'AI 시대의 수혜주 NVIDIA 분석...' },
      { title: '코스피 3000 돌파 전망', content: '코스피 지수의 향후 전망과 투자 전략...' },
      { title: '해외주식 투자 방법', content: '미국 주식 직접 투자하는 방법 정리...' },
      { title: '주식 초보자 가이드', content: '주식 투자를 시작하는 분들을 위한 기초 지식...' },
      { title: '테마주 분석: 2차전지', content: '전기차 시대, 2차전지 관련주 분석...' },
      { title: '공모주 청약 일정', content: '이번 달 공모주 청약 일정과 분석...' },
    ],
    coin: [
      { title: '비트코인 10만불 전망', content: '비트코인이 10만불을 돌파할 수 있을까요?...' },
      { title: '이더리움 업그레이드 소식', content: '이더리움의 새로운 업그레이드가 가져올 변화...' },
      { title: '알트코인 투자 전략', content: '유망한 알트코인 선별 방법과 투자 전략...' },
      { title: '디파이(DeFi) 입문 가이드', content: '탈중앙화 금융 서비스 이용 방법...' },
      { title: 'NFT 시장 동향', content: 'NFT 시장의 현재와 미래 전망...' },
      { title: '스테이킹으로 수익 창출하기', content: '암호화폐 스테이킹의 모든 것...' },
      { title: '거래소 비교 분석', content: '국내외 주요 거래소 수수료 및 특징 비교...' },
      { title: '코인 세금 정리', content: '암호화폐 투자 수익에 대한 세금 가이드...' },
      { title: '메타버스 코인 분석', content: '메타버스 관련 유망 코인 프로젝트...' },
      { title: '코인 차트 분석법', content: '기술적 분석을 통한 매매 타이밍 잡기...' },
    ],
    shopping: [
      { title: '쿠팡 로켓배송 꿀팁', content: '쿠팡에서 더 저렴하게 구매하는 방법...' },
      { title: '해외직구 관세 계산법', content: '해외직구 시 관세 계산하는 방법 정리...' },
      { title: '편의점 할인 이벤트 모음', content: '이번 달 편의점별 할인 이벤트 정리...' },
      { title: '중고거래 사기 예방법', content: '안전한 중고거래를 위한 체크리스트...' },
      { title: '온라인 쇼핑몰 비교', content: '주요 온라인 쇼핑몰 가격 비교 분석...' },
      { title: '카드 할인 혜택 총정리', content: '쇼핑에 유용한 신용카드 할인 혜택...' },
      { title: '명품 병행수입 구매 가이드', content: '안전하게 병행수입 명품 구매하는 방법...' },
      { title: '공동구매 사이트 추천', content: '믿을 수 있는 공동구매 사이트 모음...' },
      { title: '환율 좋을 때 직구하기', content: '환율 변동을 활용한 해외직구 타이밍...' },
      { title: '리퍼브 제품 구매 가이드', content: '리퍼브 제품의 장단점과 구매 팁...' },
    ],
    mobile: [
      { title: '갤럭시 S24 사전예약 혜택', content: '갤럭시 S24 시리즈 사전예약 혜택 총정리...' },
      { title: '알뜰폰 요금제 비교', content: '통신 3사 대비 알뜰폰 요금제 비교 분석...' },
      { title: '아이폰 16 루머 정리', content: '아이폰 16에 대한 최신 루머와 예상 스펙...' },
      { title: '5G 요금제 추천', content: '사용 패턴별 5G 요금제 추천...' },
      { title: '중고폰 구매 체크리스트', content: '중고폰 구매 시 확인해야 할 사항들...' },
      { title: '휴대폰 보험 가입 필요할까?', content: '휴대폰 보험의 장단점 분석...' },
      { title: '공기계 활용법', content: '남는 공기계 200% 활용하는 방법...' },
      { title: '번호이동 혜택 비교', content: '통신사별 번호이동 프로모션 비교...' },
      { title: '스마트폰 배터리 관리법', content: '배터리 수명을 늘리는 사용 습관...' },
      { title: '최신 스마트폰 카메라 비교', content: '주요 플래그십 스마트폰 카메라 성능 비교...' },
    ],
    realestate: [
      { title: '서울 아파트 시세 동향', content: '최근 서울 주요 지역 아파트 시세 변화...' },
      { title: '청약 가점 높이는 방법', content: '청약 가점을 효율적으로 높이는 전략...' },
      { title: '전세 vs 월세 계산법', content: '전세와 월세 중 유리한 선택은?...' },
      { title: '부동산 세금 정리', content: '부동산 관련 세금 종류와 계산법...' },
      { title: '신도시 분양 일정', content: '3기 신도시 분양 일정과 입지 분석...' },
      { title: '전세사기 예방법', content: '전세사기 피하는 체크리스트...' },
      { title: '오피스텔 투자 가이드', content: '오피스텔 투자의 장단점과 수익률 분석...' },
      { title: '재개발·재건축 투자', content: '재개발, 재건축 투자 시 주의사항...' },
      { title: '부동산 대출 비교', content: '주택담보대출 상품 비교 분석...' },
      { title: '상가 투자 노하우', content: '성공적인 상가 투자를 위한 팁...' },
    ],
    auction: [
      { title: '법원경매 입문 가이드', content: '법원경매 참여 방법과 절차 안내...' },
      { title: '온비드 이용방법', content: '공공기관 물품 경매 사이트 온비드 활용법...' },
      { title: '경매 물건 분석하는 법', content: '수익성 있는 경매 물건 고르는 방법...' },
      { title: '권리분석 기초', content: '경매 물건의 권리분석 방법과 주의사항...' },
      { title: '명도 절차 안내', content: '낙찰 후 명도 절차와 비용 정리...' },
      { title: '경매 실패 사례 분석', content: '경매 투자 실패 사례와 교훈...' },
      { title: 'NPL 투자 가이드', content: '부실채권(NPL) 투자의 이해...' },
      { title: '자동차 경매 참여하기', content: '중고차 경매 참여 방법과 팁...' },
      { title: '미술품 경매 입문', content: '미술품 경매 시장의 이해와 참여 방법...' },
      { title: '경매 대출 활용법', content: '경매 참여 시 대출 활용 전략...' },
    ],
  };

  for (const menu of createdMenus) {
    const posts = samplePosts[menu.slug as keyof typeof samplePosts] || [];
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const slug = `${menu.slug}-post-${i + 1}`;
      await prisma.post.upsert({
        where: { slug },
        update: {
          title: post.title,
          content: post.content,
          excerpt: post.content.substring(0, 100) + '...',
        },
        create: {
          title: post.title,
          content: post.content,
          excerpt: post.content.substring(0, 100) + '...',
          slug,
          menuId: menu.id,
          authorId: admin.id,
          publishedAt: new Date(),
          views: Math.floor(Math.random() * 1000),
          likes: Math.floor(Math.random() * 100),
          isPublished: true,
          isNotice: i === 0, // 첫 번째 게시글을 공지사항으로
        },
      });
    }
  }
  console.log('✅ Sample posts created');

  // 4. 메인페이지 블록 설정
  const blocks = [
    {
      type: 'hero',
      name: '히어로 섹션',
      config: JSON.stringify({
        title: 'CodeB CMS에 오신 것을 환영합니다',
        subtitle: '다양한 정보와 커뮤니티를 한 곳에서',
        backgroundImage: '/images/hero-bg.jpg',
        ctaText: '시작하기',
        ctaLink: '/register',
      }),
      order: 1,
      location: 'home',
      isActive: true,
    },
    {
      type: 'recent-posts',
      name: '최근 게시물',
      config: JSON.stringify({
        title: '최신 글',
        limit: 6,
        showCategory: true,
        showAuthor: true,
        showDate: true,
      }),
      order: 2,
      location: 'home',
      isActive: true,
    },
    {
      type: 'category-grid',
      name: '카테고리 그리드',
      config: JSON.stringify({
        title: '관심 주제를 선택하세요',
        columns: 3,
        showIcon: true,
        showDescription: true,
      }),
      order: 3,
      location: 'home',
      isActive: true,
    },
    {
      type: 'popular-posts',
      name: '인기 게시물',
      config: JSON.stringify({
        title: '인기 글',
        limit: 5,
        period: 'week', // week, month, all
        showViewCount: true,
        showLikeCount: true,
      }),
      order: 4,
      location: 'home',
      isActive: true,
    },
  ];

  for (const block of blocks) {
    await prisma.block.upsert({
      where: {
        location_order: {
          location: block.location,
          order: block.order,
        },
      },
      update: block,
      create: block,
    });
  }
  console.log('✅ Homepage blocks created');

  // 5. 사이트 설정
  const settings = [
    { key: 'site_name', value: 'CodeB CMS', type: 'string', category: 'general', label: '사이트 이름' },
    { key: 'site_description', value: 'QPS 10K+ 고성능 한국형 커뮤니티 플랫폼', type: 'string', category: 'general', label: '사이트 설명' },
    { key: 'posts_per_page', value: '10', type: 'number', category: 'general', label: '페이지당 게시물 수' },
    { key: 'allow_registration', value: 'true', type: 'boolean', category: 'general', label: '회원가입 허용' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    });
  }

  console.log('✅ Site settings created');

  // 6. 테스트 사용자 생성
  const testUsers = [
    { email: 'user1@example.com', username: 'user1', name: '홍길동', password: 'password123' },
    { email: 'user2@example.com', username: 'user2', name: '김철수', password: 'password123' },
    { email: 'user3@example.com', username: 'user3', name: '이영희', password: 'password123' },
  ];

  for (const userData of testUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email }
    });

    if (!existingUser) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      await prisma.user.create({
        data: {
          email: userData.email,
          username: userData.username,
          password: hashedPassword,
          name: userData.name,
          role: 'USER',
          isActive: true,
        },
      });
    }
  }
  console.log('✅ Test users created');

  // 7. 네비게이션 메뉴 생성
  const headerMenu = await prisma.navigationMenu.upsert({
    where: {
      name_position: {
        name: '메인 메뉴',
        position: 'header',
      },
    },
    update: {},
    create: {
      name: '메인 메뉴',
      position: 'header',
    },
  });

  const menuItems = [
    { title: '홈', url: '/', order: 0 },
    { title: '주식', url: '/posts/stock', order: 1 },
    { title: '코인', url: '/posts/coin', order: 2 },
    { title: '알뜰구매', url: '/posts/shopping', order: 3 },
    { title: '휴대폰', url: '/posts/mobile', order: 4 },
    { title: '부동산', url: '/posts/realestate', order: 5 },
    { title: '경매', url: '/posts/auction', order: 6 },
  ];

  for (const item of menuItems) {
    await prisma.menuItem.create({
      data: {
        ...item,
        menuId: headerMenu.id,
      },
    });
  }
  console.log('✅ Navigation menu created');

  console.log('🎉 Database seeding completed!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error seeding database:', e);
    await prisma.$disconnect();
    process.exit(1);
  });