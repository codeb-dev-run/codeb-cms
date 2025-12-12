/**
 * 이메일 발송 시스템
 * SMTP 기반 이메일 전송 및 템플릿 관리
 */

import nodemailer from 'nodemailer';
import { env } from './env.server';
import type { User } from '@prisma/client';

// 이메일 템플릿 타입
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// 이메일 발송 결과
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// SMTP 트랜스포터 생성
function createTransporter() {
  if (!env.EMAIL_SMTP_HOST || !env.EMAIL_FROM) {
    console.warn('이메일 설정이 누락되어 이메일 기능이 비활성화됩니다.');
    return null;
  }

  return nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST,
    port: env.EMAIL_SMTP_PORT || 587,
    secure: env.EMAIL_SMTP_PORT === 465,
    auth: env.EMAIL_SMTP_USER && env.EMAIL_SMTP_PASS ? {
      user: env.EMAIL_SMTP_USER,
      pass: env.EMAIL_SMTP_PASS,
    } : undefined,
  });
}

// 이메일 템플릿 생성기
export const emailTemplates = {
  /**
   * 비밀번호 재설정 이메일
   */
  passwordReset: (user: Pick<User, 'name' | 'username'>, resetToken: string): EmailTemplate => {
    const resetUrl = `${env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;
    const userName = user.name || user.username;
    
    return {
      subject: '블리CMS 비밀번호 재설정',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>비밀번호 재설정</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
            <h2 style="color: #2563eb; margin-bottom: 20px;">비밀번호 재설정 요청</h2>
            <p>안녕하세요, ${userName}님!</p>
            <p>블리CMS 계정의 비밀번호 재설정을 요청하셨습니다.</p>
            <p>아래 버튼을 클릭하여 새로운 비밀번호를 설정해주세요:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                비밀번호 재설정
              </a>
            </div>
            
            <p>또는 다음 링크를 브라우저에 복사하여 붙여넣기 하세요:</p>
            <p style="word-break: break-all; background-color: #f1f5f9; padding: 10px; border-radius: 4px; font-family: monospace;">
              ${resetUrl}
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">
              <p><strong>주의사항:</strong></p>
              <ul>
                <li>이 링크는 1시간 후 만료됩니다.</li>
                <li>비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하세요.</li>
                <li>보안을 위해 이 이메일을 다른 사람과 공유하지 마세요.</li>
              </ul>
            </div>
            
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
              <p>© 2024 블리CMS. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
안녕하세요, ${userName}님!

블리CMS 계정의 비밀번호 재설정을 요청하셨습니다.

다음 링크를 클릭하여 새로운 비밀번호를 설정해주세요:
${resetUrl}

주의사항:
- 이 링크는 1시간 후 만료됩니다.
- 비밀번호 재설정을 요청하지 않으셨다면 이 이메일을 무시하세요.
- 보안을 위해 이 이메일을 다른 사람과 공유하지 마세요.

© 2024 블리CMS. All rights reserved.
      `
    };
  },

  /**
   * 환영 이메일 (회원가입 시)
   */
  welcome: (user: Pick<User, 'name' | 'username' | 'email'>): EmailTemplate => {
    const userName = user.name || user.username;
    const loginUrl = `${env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/auth/login`;
    
    return {
      subject: '블리CMS에 오신 것을 환영합니다!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>환영합니다</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f0f9ff; padding: 30px; border-radius: 10px;">
            <h2 style="color: #0ea5e9; margin-bottom: 20px;">🎉 환영합니다!</h2>
            <p>안녕하세요, ${userName}님!</p>
            <p>블리CMS 커뮤니티에 가입해주셔서 감사합니다.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #1e40af;">계정 정보</h3>
              <p><strong>사용자명:</strong> ${user.username}</p>
              <p><strong>이메일:</strong> ${user.email}</p>
              <p><strong>가입일:</strong> ${new Date().toLocaleDateString('ko-KR')}</p>
            </div>
            
            <p>이제 다음과 같은 기능들을 이용하실 수 있습니다:</p>
            <ul>
              <li>📝 게시글 작성 및 댓글 달기</li>
              <li>💬 다른 사용자들과 소통</li>
              <li>⭐ 좋아하는 게시글에 좋아요 표시</li>
              <li>🔔 맞춤 알림 설정</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" 
                 style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                지금 시작하기
              </a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #bfdbfe; font-size: 14px; color: #1e40af;">
              <p>궁금한 점이 있으시면 언제든 문의해주세요!</p>
            </div>
            
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
              <p>© 2024 블리CMS. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
안녕하세요, ${userName}님!

블리CMS 커뮤니티에 가입해주셔서 감사합니다.

계정 정보:
- 사용자명: ${user.username}
- 이메일: ${user.email}
- 가입일: ${new Date().toLocaleDateString('ko-KR')}

이제 다음과 같은 기능들을 이용하실 수 있습니다:
- 게시글 작성 및 댓글 달기
- 다른 사용자들과 소통
- 좋아하는 게시글에 좋아요 표시
- 맞춤 알림 설정

지금 시작하기: ${loginUrl}

궁금한 점이 있으시면 언제든 문의해주세요!

© 2024 블리CMS. All rights reserved.
      `
    };
  },

  /**
   * 이메일 확인 요청
   */
  emailVerification: (user: Pick<User, 'name' | 'username'>, verificationToken: string): EmailTemplate => {
    const userName = user.name || user.username;
    const verifyUrl = `${env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000'}/auth/verify-email?token=${verificationToken}`;
    
    return {
      subject: '블리CMS 이메일 주소 확인',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>이메일 주소 확인</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #fefce8; padding: 30px; border-radius: 10px;">
            <h2 style="color: #ca8a04; margin-bottom: 20px;">📧 이메일 주소 확인</h2>
            <p>안녕하세요, ${userName}님!</p>
            <p>블리CMS 계정의 이메일 주소 확인을 위해 아래 버튼을 클릭해주세요:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" 
                 style="background-color: #ca8a04; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                이메일 확인
              </a>
            </div>
            
            <p>또는 다음 링크를 브라우저에 복사하여 붙여넣기 하세요:</p>
            <p style="word-break: break-all; background-color: #fef3c7; padding: 10px; border-radius: 4px; font-family: monospace;">
              ${verifyUrl}
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #fbbf24; font-size: 14px; color: #92400e;">
              <p><strong>참고:</strong> 이메일 확인을 완료하면 모든 기능을 이용하실 수 있습니다.</p>
            </div>
            
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
              <p>© 2024 블리CMS. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
안녕하세요, ${userName}님!

블리CMS 계정의 이메일 주소 확인을 위해 다음 링크를 클릭해주세요:
${verifyUrl}

참고: 이메일 확인을 완료하면 모든 기능을 이용하실 수 있습니다.

© 2024 블리CMS. All rights reserved.
      `
    };
  }
};

// 이메일 발송 함수
export async function sendEmail(
  to: string,
  template: EmailTemplate
): Promise<EmailResult> {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.error('이메일 트랜스포터가 구성되지 않았습니다.');
    return {
      success: false,
      error: '이메일 서비스를 사용할 수 없습니다.'
    };
  }

  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    console.log('이메일 발송 성공:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('이메일 발송 실패:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : '이메일 발송 중 오류가 발생했습니다.'
    };
  }
}

// 특화된 이메일 발송 함수들
export async function sendPasswordResetEmail(
  user: Pick<User, 'name' | 'username' | 'email'>,
  resetToken: string
): Promise<EmailResult> {
  const template = emailTemplates.passwordReset(user, resetToken);
  return sendEmail(user.email, template);
}

export async function sendWelcomeEmail(
  user: Pick<User, 'name' | 'username' | 'email'>
): Promise<EmailResult> {
  const template = emailTemplates.welcome(user);
  return sendEmail(user.email, template);
}

export async function sendEmailVerification(
  user: Pick<User, 'name' | 'username' | 'email'>,
  verificationToken: string
): Promise<EmailResult> {
  const template = emailTemplates.emailVerification(user, verificationToken);
  return sendEmail(user.email, template);
}

// 이메일 설정 테스트
export async function testEmailConfiguration(): Promise<EmailResult> {
  const transporter = createTransporter();
  
  if (!transporter) {
    return {
      success: false,
      error: '이메일 트랜스포터가 구성되지 않았습니다.'
    };
  }

  try {
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '이메일 설정 테스트 실패'
    };
  }
}