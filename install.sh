#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# claude-os installer
# Usage: curl -fsSL <url>/install.sh | bash
#   or:  bash install.sh
# ─────────────────────────────────────────────

GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $*"; }
dim()   { echo -e "${DIM}  $*${NC}"; }
bold()  { echo -e "${BOLD}$*${NC}"; }
error() { echo -e "\033[0;31m✗ $*${NC}" >&2; exit 1; }

# ── 사전 조건 확인 ──
command -v node >/dev/null 2>&1 || error "Node.js가 설치되어 있지 않습니다 (>=18 필요)"
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VERSION" -ge 18 ] || error "Node.js 18+ 이 필요합니다 (현재: v${NODE_VERSION})"

command -v npm >/dev/null 2>&1 || error "npm이 설치되어 있지 않습니다"

# ── 설치 경로 ──
INSTALL_DIR="${CLAUDE_OS_HOME:-$HOME/.claude-os}"
BIN_DIR="${CLAUDE_OS_BIN:-$HOME/.local/bin}"

bold "claude-os 설치를 시작합니다..."
echo ""

# ── 소스 결정: 로컬 또는 git clone ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"claude-os"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
  # 로컬 소스에서 설치
  SOURCE_DIR="$SCRIPT_DIR"
  dim "로컬 소스에서 설치: $SOURCE_DIR"
else
  # Git에서 clone (향후 릴리스 시)
  SOURCE_DIR=$(mktemp -d)
  dim "임시 디렉토리: $SOURCE_DIR"

  if command -v git >/dev/null 2>&1; then
    # TODO: 실제 repo URL로 교체
    error "원격 설치는 아직 지원하지 않습니다. 로컬에서 install.sh를 실행하세요."
  else
    error "git이 설치되어 있지 않습니다"
  fi
fi

# ── 의존성 설치 & 빌드 ──
cd "$SOURCE_DIR"
dim "의존성 설치 중..."
npm install --silent 2>/dev/null

dim "빌드 중..."
npm run build --silent 2>/dev/null
info "빌드 완료"

# ── 글로벌 링크 ──
dim "글로벌 심볼릭 링크 생성 중..."
npm link --silent 2>/dev/null
info "claude-os 명령어가 설치되었습니다"

# ── 저장소 초기화 ──
mkdir -p "$INSTALL_DIR"
info "저장소 디렉토리: $INSTALL_DIR"

# ── PATH 확인 ──
if ! command -v claude-os >/dev/null 2>&1; then
  echo ""
  echo -e "${DIM}claude-os가 PATH에 없습니다. 아래를 셸 설정에 추가하세요:${NC}"
  echo ""
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
fi

echo ""
bold "🎉 claude-os 설치가 완료되었습니다!"
echo ""
echo "  시작하기:"
echo "    claude-os init          저장소 초기화"
echo "    claude-os init --harness  CLAUDE.md 자동 생성 포함"
echo "    claude-os commit -m \"first snapshot\"  첫 스냅샷"
echo "    claude-os log           히스토리 조회"
echo "    claude-os --help        전체 명령어 보기"
echo ""
