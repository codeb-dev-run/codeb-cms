#!/bin/bash

# 프로덕션 환경 설정 스크립트
# CodeB CMS 프로덕션 배포를 위한 자동화 설정

set -e  # 오류 발생 시 스크립트 중단

# 색상 코드 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 제목 출력
echo -e "${BLUE}"
echo "=================================================="
echo "        CodeB CMS 프로덕션 환경 설정 스크립트"
echo "=================================================="
echo -e "${NC}"

# 사용자 확인
read -p "프로덕션 환경을 설정하시겠습니까? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "설정이 취소되었습니다."
    exit 1
fi

# 환경 변수 확인
check_env_vars() {
    log_info "필수 환경 변수 확인 중..."
    
    local required_vars=(
        "DATABASE_URL"
        "JWT_SECRET"
        "SESSION_SECRET"
        "POSTGRES_PASSWORD"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "다음 환경 변수가 설정되지 않았습니다:"
        printf '%s\n' "${missing_vars[@]}"
        log_error ".env.production 파일을 확인하고 다시 시도해주세요."
        exit 1
    fi
    
    log_success "모든 필수 환경 변수가 설정되어 있습니다."
}

# Docker 및 Docker Compose 확인
check_docker() {
    log_info "Docker 환경 확인 중..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker가 설치되어 있지 않습니다."
        log_info "Docker를 먼저 설치해주세요: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose가 설치되어 있지 않습니다."
        log_info "Docker Compose를 먼저 설치해주세요."
        exit 1
    fi
    
    # Docker 데몬 실행 확인
    if ! docker info &> /dev/null; then
        log_error "Docker 데몬이 실행되고 있지 않습니다."
        log_info "Docker를 시작하고 다시 시도해주세요."
        exit 1
    fi
    
    log_success "Docker 환경이 준비되었습니다."
}

# 환경 파일 설정
setup_env_files() {
    log_info "환경 파일 설정 중..."
    
    if [[ ! -f .env.production ]]; then
        if [[ -f .env.production.example ]]; then
            log_info ".env.production.example에서 .env.production을 생성합니다."
            cp .env.production.example .env.production
            log_warning ".env.production 파일을 편집하여 실제 값을 설정해주세요."
        else
            log_error ".env.production.example 파일이 없습니다."
            exit 1
        fi
    else
        log_success ".env.production 파일이 이미 존재합니다."
    fi
}

# SSL 인증서 설정 확인
check_ssl_setup() {
    log_info "SSL 인증서 설정 확인 중..."
    
    # Let's Encrypt 인증서 디렉토리 생성
    sudo mkdir -p /etc/letsencrypt
    sudo chmod 755 /etc/letsencrypt
    
    if [[ -z "${ACME_EMAIL}" ]]; then
        log_warning "ACME_EMAIL이 설정되지 않았습니다. SSL 자동 갱신이 비활성화됩니다."
    else
        log_success "SSL 인증서 자동 설정이 준비되었습니다."
    fi
}

# 디렉토리 구조 설정
setup_directories() {
    log_info "필요한 디렉토리 구조 생성 중..."
    
    local directories=(
        "uploads"
        "logs"
        "monitoring/grafana/dashboards"
        "monitoring/grafana/provisioning"
        "scripts"
        "backup"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        log_info "디렉토리 생성: $dir"
    done
    
    # 권한 설정
    chmod 755 uploads logs
    chmod -R 644 monitoring/
    
    log_success "디렉토리 구조가 생성되었습니다."
}

# 데이터베이스 마이그레이션
run_migrations() {
    log_info "데이터베이스 마이그레이션 실행 중..."
    
    # Docker Compose로 임시 데이터베이스 컨테이너 시작
    docker-compose -f docker-compose.production.yml up -d postgres_primary
    
    # 데이터베이스가 준비될 때까지 대기
    log_info "데이터베이스 시작을 기다리는 중..."
    sleep 10
    
    # Prisma 마이그레이션 실행
    if npm run db:migrate:prod; then
        log_success "데이터베이스 마이그레이션이 완료되었습니다."
    else
        log_error "데이터베이스 마이그레이션에 실패했습니다."
        exit 1
    fi
    
    # 임시 컨테이너 중지
    docker-compose -f docker-compose.production.yml stop postgres_primary
}

# 애플리케이션 빌드
build_application() {
    log_info "애플리케이션 빌드 중..."
    
    # 의존성 설치
    log_info "의존성 설치 중..."
    npm ci --only=production
    
    # Prisma 클라이언트 생성
    log_info "Prisma 클라이언트 생성 중..."
    npx prisma generate
    
    # 애플리케이션 빌드
    log_info "애플리케이션 컴파일 중..."
    if npm run build; then
        log_success "애플리케이션 빌드가 완료되었습니다."
    else
        log_error "애플리케이션 빌드에 실패했습니다."
        exit 1
    fi
}

# Docker 이미지 빌드
build_docker_images() {
    log_info "Docker 이미지 빌드 중..."
    
    if docker-compose -f docker-compose.production.yml build --no-cache; then
        log_success "Docker 이미지 빌드가 완료되었습니다."
    else
        log_error "Docker 이미지 빌드에 실패했습니다."
        exit 1
    fi
}

# 보안 설정
setup_security() {
    log_info "보안 설정 적용 중..."
    
    # 파일 권한 설정
    chmod 600 .env.production
    chmod 700 scripts/*.sh
    
    # 민감한 파일 숨김
    if [[ -f .env ]]; then
        chmod 600 .env
    fi
    
    log_success "보안 설정이 적용되었습니다."
}

# 백업 시스템 설정
setup_backup_system() {
    log_info "백업 시스템 설정 중..."
    
    # 백업 스크립트 권한 설정
    if [[ -f scripts/backup.sh ]]; then
        chmod +x scripts/backup.sh
        log_info "백업 스크립트 권한 설정 완료"
    fi
    
    if [[ -f scripts/restore.sh ]]; then
        chmod +x scripts/restore.sh
        log_info "복원 스크립트 권한 설정 완료"
    fi
    
    # 백업 디렉토리 생성
    mkdir -p backup/database backup/uploads
    
    log_success "백업 시스템이 설정되었습니다."
}

# 모니터링 설정
setup_monitoring() {
    log_info "모니터링 시스템 설정 중..."
    
    # Prometheus 설정 파일 확인
    if [[ ! -f monitoring/prometheus.yml ]]; then
        log_warning "monitoring/prometheus.yml 파일이 없습니다."
        log_info "기본 설정 파일을 생성합니다."
        
        cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'codeb-cms-app'
    static_configs:
      - targets: ['app:3000']
    scrape_interval: 30s
    metrics_path: '/api/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres_primary:5432']
    scrape_interval: 60s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis_node_1:7001', 'redis_node_2:7002', 'redis_node_3:7003']
    scrape_interval: 30s
EOF
    fi
    
    log_success "모니터링 설정이 완료되었습니다."
}

# 헬스 체크
health_check() {
    log_info "시스템 헬스 체크 실행 중..."
    
    # Docker Compose 설정 유효성 검사
    if docker-compose -f docker-compose.production.yml config > /dev/null 2>&1; then
        log_success "Docker Compose 설정이 유효합니다."
    else
        log_error "Docker Compose 설정에 오류가 있습니다."
        docker-compose -f docker-compose.production.yml config
        exit 1
    fi
    
    # 포트 사용 여부 확인
    local ports=(80 443 3000 5432 9090 3001)
    for port in "${ports[@]}"; do
        if lsof -i ":$port" > /dev/null 2>&1; then
            log_warning "포트 $port가 이미 사용 중입니다."
        fi
    done
    
    # 디스크 공간 확인
    local disk_usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 80 ]]; then
        log_warning "디스크 사용량이 ${disk_usage}%입니다. 공간을 확보해주세요."
    fi
    
    log_success "헬스 체크가 완료되었습니다."
}

# 프로덕션 시작
start_production() {
    log_info "프로덕션 환경 시작 중..."
    
    # 기존 컨테이너 정리
    docker-compose -f docker-compose.production.yml down
    
    # 프로덕션 서비스 시작
    if docker-compose -f docker-compose.production.yml up -d; then
        log_success "프로덕션 환경이 성공적으로 시작되었습니다!"
        
        echo -e "\n${GREEN}========================================${NC}"
        echo -e "${GREEN}     프로덕션 환경 시작 완료!${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo -e "${BLUE}애플리케이션 URL: ${NC}https://${DOMAIN:-localhost}"
        echo -e "${BLUE}Grafana 모니터링: ${NC}https://grafana.${DOMAIN:-localhost}"
        echo -e "${BLUE}Prometheus 메트릭: ${NC}https://monitoring.${DOMAIN:-localhost}"
        echo -e "\n${YELLOW}유용한 명령어:${NC}"
        echo "  - 로그 확인: docker-compose -f docker-compose.production.yml logs -f"
        echo "  - 상태 확인: docker-compose -f docker-compose.production.yml ps"
        echo "  - 서비스 재시작: docker-compose -f docker-compose.production.yml restart"
        echo "  - 서비스 중지: docker-compose -f docker-compose.production.yml down"
        echo ""
    else
        log_error "프로덕션 환경 시작에 실패했습니다."
        exit 1
    fi
}

# 메인 실행 함수
main() {
    # 환경 변수 로드
    if [[ -f .env.production ]]; then
        source .env.production
    fi
    
    # 단계별 실행
    check_docker
    setup_env_files
    check_env_vars
    setup_directories
    setup_security
    check_ssl_setup
    setup_backup_system
    setup_monitoring
    build_application
    build_docker_images
    # run_migrations  # 필요시 주석 해제
    health_check
    
    # 사용자 확인
    echo ""
    read -p "프로덕션 환경을 시작하시겠습니까? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_production
    else
        log_info "설정이 완료되었습니다. 다음 명령어로 수동으로 시작할 수 있습니다:"
        echo "  docker-compose -f docker-compose.production.yml up -d"
    fi
}

# 스크립트 실행
main "$@"