import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Switch } from "~/components/ui/switch";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { db } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";
import { z } from "zod";

const settingSchema = z.object({
  key: z.string(),
  value: z.string(),
});

// 설정 키 정의
const SETTING_KEYS = {
  SITE_NAME: 'site_name',
  SITE_DESCRIPTION: 'site_description',
  SITE_URL: 'site_url',
  ALLOW_REGISTRATION: 'allow_registration',
  POSTS_PER_PAGE: 'posts_per_page',
  REQUIRE_EMAIL_VERIFICATION: 'require_email_verification',
  DEFAULT_USER_ROLE: 'default_user_role',
  MAINTENANCE_MODE: 'maintenance_mode',
  MAINTENANCE_MESSAGE: 'maintenance_message',
  // SEO 설정
  SEO_TITLE_TEMPLATE: 'seo_title_template',
  SEO_META_KEYWORDS: 'seo_meta_keywords',
  SEO_META_AUTHOR: 'seo_meta_author',
  SEO_FACEBOOK_APP_ID: 'seo_facebook_app_id',
  SEO_TWITTER_HANDLE: 'seo_twitter_handle',
  // 푸터 설정
  FOOTER_EMAIL: 'footer_email',
  FOOTER_PHONE: 'footer_phone',
  FOOTER_ADDRESS: 'footer_address',
  FOOTER_FACEBOOK: 'footer_facebook',
  FOOTER_TWITTER: 'footer_twitter',
  FOOTER_INSTAGRAM: 'footer_instagram',
  FOOTER_GITHUB: 'footer_github',
} as const;

// 기본 설정값
const DEFAULT_SETTINGS = {
  [SETTING_KEYS.SITE_NAME]: 'CodeB CMS',
  [SETTING_KEYS.SITE_DESCRIPTION]: 'A modern content management system',
  [SETTING_KEYS.SITE_URL]: 'http://localhost:3000',
  [SETTING_KEYS.ALLOW_REGISTRATION]: 'true',
  [SETTING_KEYS.POSTS_PER_PAGE]: '10',
  [SETTING_KEYS.REQUIRE_EMAIL_VERIFICATION]: 'false',
  [SETTING_KEYS.DEFAULT_USER_ROLE]: 'USER',
  [SETTING_KEYS.MAINTENANCE_MODE]: 'false',
  [SETTING_KEYS.MAINTENANCE_MESSAGE]: '사이트 점검 중입니다. 잠시 후 다시 방문해주세요.',
  // SEO 기본값
  [SETTING_KEYS.SEO_TITLE_TEMPLATE]: '%s | CodeB CMS',
  [SETTING_KEYS.SEO_META_KEYWORDS]: '',
  [SETTING_KEYS.SEO_META_AUTHOR]: '',
  [SETTING_KEYS.SEO_FACEBOOK_APP_ID]: '',
  [SETTING_KEYS.SEO_TWITTER_HANDLE]: '',
  // 푸터 기본값
  [SETTING_KEYS.FOOTER_EMAIL]: 'contact@codeb-cms.com',
  [SETTING_KEYS.FOOTER_PHONE]: '02-1234-5678',
  [SETTING_KEYS.FOOTER_ADDRESS]: '서울특별시 강남구',
  [SETTING_KEYS.FOOTER_FACEBOOK]: 'https://facebook.com',
  [SETTING_KEYS.FOOTER_TWITTER]: 'https://twitter.com',
  [SETTING_KEYS.FOOTER_INSTAGRAM]: 'https://instagram.com',
  [SETTING_KEYS.FOOTER_GITHUB]: 'https://github.com',
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUser(request);

  const settings = await db.setting.findMany();
  
  // 설정값을 키-값 객체로 변환
  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  // 기본값과 병합
  const mergedSettings = { ...DEFAULT_SETTINGS, ...settingsMap };

  return json({ settings: mergedSettings });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);

  const formData = await request.formData();
  const updates: Array<{ key: string; value: string }> = [];

  // 모든 설정 키에 대해 값 확인
  for (const key of Object.values(SETTING_KEYS)) {
    const value = formData.get(key);
    
    // checkbox는 체크되지 않으면 전송되지 않으므로 특별 처리
    if ([SETTING_KEYS.ALLOW_REGISTRATION, SETTING_KEYS.REQUIRE_EMAIL_VERIFICATION, SETTING_KEYS.MAINTENANCE_MODE].includes(key)) {
      updates.push({ key, value: value === 'true' ? 'true' : 'false' });
    } else if (value !== null) {
      updates.push({ key, value: value.toString() });
    }
  }

  console.log('Settings to update:', updates.length);
  console.log('Updates:', updates);

  try {
    // 설정값 업데이트 (upsert)
    await db.$transaction(
      updates.map(({ key, value }) =>
        db.setting.upsert({
          where: { key },
          update: { value },
          create: { 
            key, 
            value,
            type: 'string',
            category: 'general'
          },
        })
      )
    );
    
    console.log('Settings saved successfully');
    return json({ success: true });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export default function AdminSettings() {
  const { settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isSubmitting = fetcher.state === 'submitting';
  const isSaved = fetcher.data?.success === true;
  const hasError = fetcher.data?.success === false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">사이트 설정</h2>
        <p className="text-muted-foreground">사이트의 기본 설정을 관리합니다.</p>
      </div>
      
      {isSaved && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          설정이 저장되었습니다.
        </div>
      )}
      
      {hasError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          설정 저장에 실패했습니다: {fetcher.data?.error}
        </div>
      )}

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-6">
          <TabsTrigger value="general">일반 설정</TabsTrigger>
          <TabsTrigger value="users">사용자 설정</TabsTrigger>
          <TabsTrigger value="content">콘텐츠 설정</TabsTrigger>
          <TabsTrigger value="seo">SEO 설정</TabsTrigger>
          <TabsTrigger value="footer">푸터 설정</TabsTrigger>
          <TabsTrigger value="maintenance">유지보수</TabsTrigger>
        </TabsList>

        <fetcher.Form method="post">
          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>기본 정보</CardTitle>
                <CardDescription>
                  사이트의 기본 정보를 설정합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="site_name">사이트 이름</Label>
                  <Input
                    id="site_name"
                    name={SETTING_KEYS.SITE_NAME}
                    defaultValue={settings[SETTING_KEYS.SITE_NAME]}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="site_description">사이트 설명</Label>
                  <Textarea
                    id="site_description"
                    name={SETTING_KEYS.SITE_DESCRIPTION}
                    defaultValue={settings[SETTING_KEYS.SITE_DESCRIPTION]}
                    rows={3}
                  />
                </div>
                
                <div>
                  <Label htmlFor="site_url">사이트 URL</Label>
                  <Input
                    id="site_url"
                    name={SETTING_KEYS.SITE_URL}
                    type="url"
                    defaultValue={settings[SETTING_KEYS.SITE_URL]}
                    required
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>사용자 설정</CardTitle>
                <CardDescription>
                  사용자 가입 및 권한 관련 설정을 관리합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="allow_registration">회원가입 허용</Label>
                    <p className="text-sm text-muted-foreground">
                      새로운 사용자의 회원가입을 허용합니다.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="allow_registration"
                    name={SETTING_KEYS.ALLOW_REGISTRATION}
                    value="true"
                    defaultChecked={settings[SETTING_KEYS.ALLOW_REGISTRATION] === 'true'}
                    className="h-4 w-4"
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="require_email_verification">이메일 인증 필수</Label>
                    <p className="text-sm text-muted-foreground">
                      회원가입 시 이메일 인증을 요구합니다.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="require_email_verification"
                    name={SETTING_KEYS.REQUIRE_EMAIL_VERIFICATION}
                    value="true"
                    defaultChecked={settings[SETTING_KEYS.REQUIRE_EMAIL_VERIFICATION] === 'true'}
                    className="h-4 w-4"
                  />
                </div>

                <Separator />

                <div>
                  <Label htmlFor="default_user_role">기본 사용자 권한</Label>
                  <select
                    id="default_user_role"
                    name={SETTING_KEYS.DEFAULT_USER_ROLE}
                    defaultValue={settings[SETTING_KEYS.DEFAULT_USER_ROLE]}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="USER">일반 사용자</option>
                    <option value="ADMIN">관리자</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>콘텐츠 설정</CardTitle>
                <CardDescription>
                  콘텐츠 표시 관련 설정을 관리합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="posts_per_page">페이지당 게시글 수</Label>
                  <Input
                    id="posts_per_page"
                    name={SETTING_KEYS.POSTS_PER_PAGE}
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={settings[SETTING_KEYS.POSTS_PER_PAGE]}
                    required
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    목록 페이지에서 한 번에 표시할 게시글 수
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="seo" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SEO 설정</CardTitle>
                <CardDescription>
                  검색 엔진 최적화를 위한 메타 정보를 설정합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="seo_title_template">제목 템플릿</Label>
                  <Input
                    id="seo_title_template"
                    name={SETTING_KEYS.SEO_TITLE_TEMPLATE}
                    defaultValue={settings[SETTING_KEYS.SEO_TITLE_TEMPLATE]}
                    placeholder="%s | 사이트명"
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    %s는 페이지 제목으로 대체됩니다
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="seo_meta_keywords">메타 키워드</Label>
                  <Input
                    id="seo_meta_keywords"
                    name={SETTING_KEYS.SEO_META_KEYWORDS}
                    defaultValue={settings[SETTING_KEYS.SEO_META_KEYWORDS]}
                    placeholder="키워드1, 키워드2, 키워드3"
                  />
                </div>
                
                <div>
                  <Label htmlFor="seo_meta_author">작성자</Label>
                  <Input
                    id="seo_meta_author"
                    name={SETTING_KEYS.SEO_META_AUTHOR}
                    defaultValue={settings[SETTING_KEYS.SEO_META_AUTHOR]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="seo_facebook_app_id">Facebook App ID</Label>
                  <Input
                    id="seo_facebook_app_id"
                    name={SETTING_KEYS.SEO_FACEBOOK_APP_ID}
                    defaultValue={settings[SETTING_KEYS.SEO_FACEBOOK_APP_ID]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="seo_twitter_handle">Twitter Handle</Label>
                  <Input
                    id="seo_twitter_handle"
                    name={SETTING_KEYS.SEO_TWITTER_HANDLE}
                    defaultValue={settings[SETTING_KEYS.SEO_TWITTER_HANDLE]}
                    placeholder="@username"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="footer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>연락처 정보</CardTitle>
                <CardDescription>
                  푸터에 표시될 연락처 정보를 설정합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="footer_email">이메일</Label>
                  <Input
                    id="footer_email"
                    name={SETTING_KEYS.FOOTER_EMAIL}
                    type="email"
                    defaultValue={settings[SETTING_KEYS.FOOTER_EMAIL]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="footer_phone">전화번호</Label>
                  <Input
                    id="footer_phone"
                    name={SETTING_KEYS.FOOTER_PHONE}
                    defaultValue={settings[SETTING_KEYS.FOOTER_PHONE]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="footer_address">주소</Label>
                  <Input
                    id="footer_address"
                    name={SETTING_KEYS.FOOTER_ADDRESS}
                    defaultValue={settings[SETTING_KEYS.FOOTER_ADDRESS]}
                  />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>소셜 미디어</CardTitle>
                <CardDescription>
                  소셜 미디어 링크를 설정합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="footer_facebook">Facebook</Label>
                  <Input
                    id="footer_facebook"
                    name={SETTING_KEYS.FOOTER_FACEBOOK}
                    type="url"
                    defaultValue={settings[SETTING_KEYS.FOOTER_FACEBOOK]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="footer_twitter">Twitter</Label>
                  <Input
                    id="footer_twitter"
                    name={SETTING_KEYS.FOOTER_TWITTER}
                    type="url"
                    defaultValue={settings[SETTING_KEYS.FOOTER_TWITTER]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="footer_instagram">Instagram</Label>
                  <Input
                    id="footer_instagram"
                    name={SETTING_KEYS.FOOTER_INSTAGRAM}
                    type="url"
                    defaultValue={settings[SETTING_KEYS.FOOTER_INSTAGRAM]}
                  />
                </div>
                
                <div>
                  <Label htmlFor="footer_github">GitHub</Label>
                  <Input
                    id="footer_github"
                    name={SETTING_KEYS.FOOTER_GITHUB}
                    type="url"
                    defaultValue={settings[SETTING_KEYS.FOOTER_GITHUB]}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>유지보수 모드</CardTitle>
                <CardDescription>
                  사이트 점검 시 유지보수 모드를 활성화합니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="maintenance_mode">유지보수 모드</Label>
                    <p className="text-sm text-muted-foreground">
                      활성화 시 관리자를 제외한 모든 사용자에게 유지보수 메시지가 표시됩니다.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="maintenance_mode"
                    name={SETTING_KEYS.MAINTENANCE_MODE}
                    value="true"
                    defaultChecked={settings[SETTING_KEYS.MAINTENANCE_MODE] === 'true'}
                    className="h-4 w-4"
                  />
                </div>

                <div>
                  <Label htmlFor="maintenance_message">유지보수 메시지</Label>
                  <Textarea
                    id="maintenance_message"
                    name={SETTING_KEYS.MAINTENANCE_MESSAGE}
                    defaultValue={settings[SETTING_KEYS.MAINTENANCE_MESSAGE]}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '설정 저장'}
            </Button>
          </div>
        </fetcher.Form>
      </Tabs>
    </div>
  );
}