import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import path from "path";

declare module "@remix-run/node" {
  interface Future {
    v3_singleFetch: true;
  }
}

export default defineConfig({
  plugins: [
    remix({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true,
      },
    }),
    // Socket.IO 제거됨 - Centrifugo로 마이그레이션
  ],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },

  // 성능 최적화 설정
  build: {
    // 청크 사이즈 경고 한계 증가 (기본 500kb -> 1000kb)
    chunkSizeWarningLimit: 1000,

    rollupOptions: {
      // 서버 사이드 빌드에서 외부 의존성으로 처리
      external: ['sharp'],
      output: {
        // 수동 청크 분할로 번들 크기 최적화
        manualChunks: {
          // React 관련 라이브러리
          'react-vendor': ['react', 'react-dom'],

          // UI 컴포넌트 라이브러리
          'ui-vendor': [
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-progress',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs'
          ],

          // 유틸리티 라이브러리
          'utils-vendor': [
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
            'date-fns',
            'lucide-react'
          ],

          // 폼 관련 라이브러리
          'form-vendor': [
            'react-hook-form',
            '@hookform/resolvers',
            'zod'
          ],

          // 드래그 앤 드롭 라이브러리
          'dnd-vendor': [
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities'
          ],

          // 상태 관리
          'state-vendor': ['zustand']
        }
      }
    },

    // 소스맵 설정 (프로덕션에서는 비활성화로 크기 줄이기)
    sourcemap: process.env.NODE_ENV === 'development',
  },

  // 개발 서버 최적화
  server: {
    // HMR 성능 개선
    hmr: {
      overlay: true
    },
    // 파일 시스템 캐싱
    fs: {
      allow: ['..']
    }
  },

  // 종속성 최적화
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      '@remix-run/react',
      'clsx',
      'tailwind-merge',
      'lru-cache'
    ],
    exclude: [
      // 큰 라이브러리는 제외하여 초기 로드 최적화
      'date-fns',
      'lucide-react'
    ]
  },

  // SSR 옵션
  ssr: {
    noExternal: ['lru-cache']
  },

  // CSS 최적화
  css: {
    devSourcemap: true
  }
});
