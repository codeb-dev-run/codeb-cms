// SMS 알림 시스템 (한국 통신사 지원)

import crypto from 'crypto';
import { prisma } from '../db.server';

// SMS 발송 결과 타입
interface SMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  cost?: number;
}

// SMS 템플릿 타입
interface SMSTemplate {
  id: string;
  name: string;
  content: string;
  variables?: string[];
}

// 네이버 클라우드 플랫폼 SENS 설정
const NAVER_SENS_CONFIG = {
  serviceId: process.env.NAVER_SENS_SERVICE_ID!,
  accessKey: process.env.NAVER_SENS_ACCESS_KEY!,
  secretKey: process.env.NAVER_SENS_SECRET_KEY!,
  from: process.env.SMS_FROM_NUMBER!,
  apiUrl: 'https://sens.apigw.ntruss.com'
};

// 카카오 알림톡 설정
const KAKAO_ALIMTALK_CONFIG = {
  apiKey: process.env.KAKAO_ALIMTALK_API_KEY!,
  plusFriendId: process.env.KAKAO_PLUS_FRIEND_ID!,
  apiUrl: 'https://alimtalk-api.bizmsg.kr'
};

// SMS 템플릿 정의
const SMS_TEMPLATES: Record<string, SMSTemplate> = {
  VERIFICATION: {
    id: 'VERIFICATION',
    name: '인증번호 발송',
    content: '[CodeB CMS] 인증번호는 {{code}}입니다. 5분 내에 입력해주세요.',
    variables: ['code']
  },
  PASSWORD_RESET: {
    id: 'PASSWORD_RESET',
    name: '비밀번호 재설정',
    content: '[CodeB CMS] 비밀번호 재설정 링크입니다: {{link}}',
    variables: ['link']
  },
  WELCOME: {
    id: 'WELCOME',
    name: '가입 환영',
    content: '[CodeB CMS] {{name}}님, 회원가입을 환영합니다! 서비스를 이용해보세요.',
    variables: ['name']
  },
  ORDER_CONFIRMATION: {
    id: 'ORDER_CONFIRMATION',
    name: '주문 확인',
    content: '[CodeB CMS] {{name}}님의 주문({{orderNumber}})이 확인되었습니다. 감사합니다.',
    variables: ['name', 'orderNumber']
  },
  PAYMENT_SUCCESS: {
    id: 'PAYMENT_SUCCESS',
    name: '결제 완료',
    content: '[CodeB CMS] 결제가 완료되었습니다. 금액: {{amount}}원, 주문번호: {{orderNumber}}',
    variables: ['amount', 'orderNumber']
  }
};

// 네이버 SENS SMS 발송
async function sendNaverSMS(
  to: string,
  content: string,
  type: 'SMS' | 'LMS' | 'MMS' = 'SMS'
): Promise<SMSResult> {
  try {
    const timestamp = Date.now().toString();
    const method = 'POST';
    const url = `/sms/v2/services/${NAVER_SENS_CONFIG.serviceId}/messages`;
    
    // 서명 생성
    const message = `${method} ${url}\n${timestamp}\n${NAVER_SENS_CONFIG.accessKey}`;
    const signature = crypto
      .createHmac('sha256', NAVER_SENS_CONFIG.secretKey)
      .update(message)
      .digest('base64');

    const payload = {
      type,
      countryCode: '82',
      from: NAVER_SENS_CONFIG.from,
      content,
      messages: [
        {
          to: to.replace(/[^0-9]/g, ''), // 숫자만 추출
          content
        }
      ]
    };

    const response = await fetch(`${NAVER_SENS_CONFIG.apiUrl}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': NAVER_SENS_CONFIG.accessKey,
        'x-ncp-apigw-signature-v2': signature
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok) {
      return {
        success: true,
        messageId: result.requestId,
        cost: result.statusCode === '202' ? 1 : 0 // 대략적인 비용
      };
    } else {
      return {
        success: false,
        error: result.errorMessage || '발송 실패'
      };
    }
  } catch (error) {
    console.error('네이버 SMS 발송 실패:', error);
    return {
      success: false,
      error: '시스템 오류'
    };
  }
}

// 카카오 알림톡 발송
async function sendKakaoAlimtalk(
  to: string,
  templateCode: string,
  templateData: Record<string, string>
): Promise<SMSResult> {
  try {
    const payload = {
      plusFriendId: KAKAO_ALIMTALK_CONFIG.plusFriendId,
      templateCode,
      recipientList: [
        {
          recipientNo: to.replace(/[^0-9]/g, ''),
          templateParameter: templateData
        }
      ]
    };

    const response = await fetch(`${KAKAO_ALIMTALK_CONFIG.apiUrl}/v1/alimtalk/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KAKAO_ALIMTALK_CONFIG.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && result.header.resultCode === '00') {
      return {
        success: true,
        messageId: result.body.requestId
      };
    } else {
      return {
        success: false,
        error: result.header.resultMessage || '알림톡 발송 실패'
      };
    }
  } catch (error) {
    console.error('카카오 알림톡 발송 실패:', error);
    return {
      success: false,
      error: '시스템 오류'
    };
  }
}

// 템플릿 렌더링
function renderTemplate(template: SMSTemplate, variables: Record<string, string>): string {
  let content = template.content;
  
  for (const [key, value] of Object.entries(variables)) {
    content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return content;
}

// 전화번호 유효성 검사
function validatePhoneNumber(phoneNumber: string): boolean {
  const cleaned = phoneNumber.replace(/[^0-9]/g, '');
  
  // 한국 휴대폰 번호 패턴 (010, 011, 016, 017, 018, 019)
  const mobilePattern = /^01[016789][0-9]{7,8}$/;
  
  // 일반 전화번호 패턴
  const phonePattern = /^(02|0[3-9][0-9])[0-9]{7,8}$/;
  
  return mobilePattern.test(cleaned) || phonePattern.test(cleaned);
}

// SMS 발송 메인 함수
export async function sendSMS(
  to: string,
  templateId: string,
  variables: Record<string, string> = {},
  options: {
    useAlimtalk?: boolean;
    priority?: 'high' | 'normal' | 'low';
    scheduledAt?: Date;
  } = {}
): Promise<SMSResult> {
  try {
    // 전화번호 유효성 검사
    if (!validatePhoneNumber(to)) {
      return {
        success: false,
        error: '유효하지 않은 전화번호입니다'
      };
    }

    // 템플릿 조회
    const template = SMS_TEMPLATES[templateId];
    if (!template) {
      return {
        success: false,
        error: '존재하지 않는 템플릿입니다'
      };
    }

    // 필수 변수 확인
    if (template.variables) {
      for (const variable of template.variables) {
        if (!variables[variable]) {
          return {
            success: false,
            error: `필수 변수가 누락되었습니다: ${variable}`
          };
        }
      }
    }

    // 메시지 렌더링
    const content = renderTemplate(template, variables);

    // 발송 이력 저장
    const smsLog = await prisma.sMSLog.create({
      data: {
        to: to.replace(/[^0-9]/g, ''),
        templateId,
        content,
        variables,
        provider: options.useAlimtalk ? 'kakao' : 'naver',
        status: 'PENDING',
        scheduledAt: options.scheduledAt
      }
    });

    let result: SMSResult;

    // 예약 발송 처리
    if (options.scheduledAt && options.scheduledAt > new Date()) {
      await prisma.sMSLog.update({
        where: { id: smsLog.id },
        data: { status: 'SCHEDULED' }
      });
      
      return {
        success: true,
        messageId: smsLog.id
      };
    }

    // 즉시 발송
    if (options.useAlimtalk && KAKAO_ALIMTALK_CONFIG.apiKey) {
      result = await sendKakaoAlimtalk(to, templateId, variables);
    } else {
      // SMS 길이에 따라 타입 결정
      const type = content.length > 90 ? 'LMS' : 'SMS';
      result = await sendNaverSMS(to, content, type);
    }

    // 발송 결과 업데이트
    await prisma.sMSLog.update({
      where: { id: smsLog.id },
      data: {
        status: result.success ? 'SENT' : 'FAILED',
        messageId: result.messageId,
        error: result.error,
        cost: result.cost || 0,
        sentAt: result.success ? new Date() : null
      }
    });

    return result;
  } catch (error) {
    console.error('SMS 발송 실패:', error);
    return {
      success: false,
      error: '시스템 오류'
    };
  }
}

// 인증번호 발송
export async function sendVerificationCode(phoneNumber: string, userId?: string): Promise<{
  success: boolean;
  verificationId?: string;
  error?: string;
}> {
  try {
    // 6자리 랜덤 숫자 생성
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 인증번호 저장 (5분 만료)
    const verification = await prisma.phoneVerification.create({
      data: {
        phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
        code,
        userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5분 후 만료
        attempts: 0
      }
    });

    // SMS 발송
    const smsResult = await sendSMS(phoneNumber, 'VERIFICATION', { code });

    if (smsResult.success) {
      return {
        success: true,
        verificationId: verification.id
      };
    } else {
      // 실패 시 인증번호 삭제
      await prisma.phoneVerification.delete({
        where: { id: verification.id }
      });
      
      return {
        success: false,
        error: smsResult.error
      };
    }
  } catch (error) {
    console.error('인증번호 발송 실패:', error);
    return {
      success: false,
      error: '시스템 오류'
    };
  }
}

// 인증번호 확인
export async function verifyPhoneCode(
  verificationId: string,
  code: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const verification = await prisma.phoneVerification.findUnique({
      where: { id: verificationId }
    });

    if (!verification) {
      return {
        success: false,
        error: '유효하지 않은 인증 요청입니다'
      };
    }

    // 만료 확인
    if (verification.expiresAt < new Date()) {
      await prisma.phoneVerification.delete({
        where: { id: verificationId }
      });
      
      return {
        success: false,
        error: '인증번호가 만료되었습니다'
      };
    }

    // 시도 횟수 확인
    if (verification.attempts >= 5) {
      await prisma.phoneVerification.delete({
        where: { id: verificationId }
      });
      
      return {
        success: false,
        error: '인증 시도 횟수를 초과했습니다'
      };
    }

    // 인증번호 확인
    if (verification.code === code) {
      // 성공 시 인증 기록 삭제 및 사용자 정보 업데이트
      await prisma.phoneVerification.delete({
        where: { id: verificationId }
      });

      if (verification.userId) {
        await prisma.user.update({
          where: { id: verification.userId },
          data: {
            phoneVerified: new Date(),
            phone: verification.phoneNumber
          }
        });
      }

      return { success: true };
    } else {
      // 실패 시 시도 횟수 증가
      await prisma.phoneVerification.update({
        where: { id: verificationId },
        data: {
          attempts: verification.attempts + 1
        }
      });

      return {
        success: false,
        error: '인증번호가 올바르지 않습니다'
      };
    }
  } catch (error) {
    console.error('인증번호 확인 실패:', error);
    return {
      success: false,
      error: '시스템 오류'
    };
  }
}

// 대량 SMS 발송
export async function sendBulkSMS(
  recipients: Array<{
    phoneNumber: string;
    variables?: Record<string, string>;
  }>,
  templateId: string,
  options: {
    batchSize?: number;
    delay?: number;
  } = {}
): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  const { batchSize = 100, delay = 1000 } = options;
  const results = { success: 0, failed: 0, errors: [] as string[] };

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    const promises = batch.map(async (recipient) => {
      const result = await sendSMS(
        recipient.phoneNumber,
        templateId,
        recipient.variables || {}
      );
      
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`${recipient.phoneNumber}: ${result.error}`);
      }
    });

    await Promise.all(promises);
    
    // 배치 간 지연
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return results;
}

// SMS 발송 통계
export async function getSMSStatistics(
  startDate: Date,
  endDate: Date
): Promise<{
  totalSent: number;
  totalFailed: number;
  totalCost: number;
  byProvider: Record<string, number>;
  byTemplate: Record<string, number>;
}> {
  const logs = await prisma.sMSLog.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    },
    select: {
      status: true,
      cost: true,
      provider: true,
      templateId: true
    }
  });

  const stats = {
    totalSent: 0,
    totalFailed: 0,
    totalCost: 0,
    byProvider: {} as Record<string, number>,
    byTemplate: {} as Record<string, number>
  };

  logs.forEach(log => {
    if (log.status === 'SENT') {
      stats.totalSent++;
      stats.totalCost += log.cost || 0;
    } else if (log.status === 'FAILED') {
      stats.totalFailed++;
    }

    stats.byProvider[log.provider] = (stats.byProvider[log.provider] || 0) + 1;
    stats.byTemplate[log.templateId] = (stats.byTemplate[log.templateId] || 0) + 1;
  });

  return stats;
}