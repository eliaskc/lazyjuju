#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
MUTED='\033[0;2m'
NC='\033[0m'

usage() {
    cat <<EOF
kajji Installer

Usage: install.sh [options]

Options:
    -h, --help              Display this help message
    -v, --version <version> Install a specific version (e.g., 0.1.1)
        --no-modify-path    Don't modify shell config files

Examples:
    curl -fsSL https://raw.githubusercontent.com/eliaskc/kajji/main/install.sh | bash
    curl -fsSL https://raw.githubusercontent.com/eliaskc/kajji/main/install.sh | bash -s -- --version 0.1.1
EOF
}

requested_version=${VERSION:-}
no_modify_path=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--version)
            if [[ -n "${2:-}" ]]; then
                requested_version="$2"
                shift 2
            else
                echo -e "${RED}Error: --version requires a version argument${NC}"
                exit 1
            fi
            ;;
        --no-modify-path)
            no_modify_path=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}" >&2
            shift
            ;;
    esac
done

raw_os=$(uname -s)
case "$raw_os" in
    Darwin*) os="darwin" ;;
    Linux*) os="linux" ;;
    *)
        echo -e "${RED}Unsupported OS: $raw_os${NC}"
        exit 1
        ;;
esac

arch=$(uname -m)
case "$arch" in
    aarch64|arm64) arch="arm64" ;;
    x86_64) arch="x64" ;;
    *)
        echo -e "${RED}Unsupported architecture: $arch${NC}"
        exit 1
        ;;
esac

if [ "$os" = "darwin" ] && [ "$arch" = "x64" ]; then
    rosetta_flag=$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)
    if [ "$rosetta_flag" = "1" ]; then
        arch="arm64"
    fi
fi

target="$os-$arch"
archive_ext=".zip"
[ "$os" = "linux" ] && archive_ext=".tar.gz"

filename="kajji-${target}${archive_ext}"

if [ "$os" = "linux" ]; then
    if ! command -v tar >/dev/null 2>&1; then
        echo -e "${RED}Error: 'tar' is required but not installed.${NC}"
        exit 1
    fi
else
    if ! command -v unzip >/dev/null 2>&1; then
        echo -e "${RED}Error: 'unzip' is required but not installed.${NC}"
        exit 1
    fi
fi

INSTALL_DIR=$HOME/.kajji/bin
mkdir -p "$INSTALL_DIR"

if [ -z "$requested_version" ]; then
    url="https://github.com/eliaskc/kajji/releases/latest/download/$filename"
    version=$(curl -sI "https://github.com/eliaskc/kajji/releases/latest" | grep -i "^location:" | sed -n 's/.*\/v\([^[:space:]]*\).*/\1/p' | tr -d '\r')
    if [ -z "$version" ]; then
        version="latest"
    fi
else
    requested_version="${requested_version#v}"
    url="https://github.com/eliaskc/kajji/releases/download/v${requested_version}/$filename"
    version=$requested_version
fi

echo -e "${MUTED}Installing kajji v${version} for ${target}...${NC}"

tmp_dir=$(mktemp -d)
trap "rm -rf $tmp_dir" EXIT

if ! curl -fsSL -o "$tmp_dir/$filename" "$url"; then
    echo -e "${RED}Failed to download kajji${NC}"
    echo -e "${MUTED}URL: $url${NC}"
    exit 1
fi

if [ "$os" = "linux" ]; then
    tar -xzf "$tmp_dir/$filename" -C "$tmp_dir"
else
    unzip -q "$tmp_dir/$filename" -d "$tmp_dir"
fi

mv "$tmp_dir/kajji" "$INSTALL_DIR/kajji"
chmod 755 "$INSTALL_DIR/kajji"

add_to_path() {
    local config_file=$1
    local command=$2

    if grep -Fxq "$command" "$config_file" 2>/dev/null; then
        return
    fi

    if [[ -w $config_file ]]; then
        echo "" >> "$config_file"
        echo "# kajji" >> "$config_file"
        echo "$command" >> "$config_file"
        echo -e "${MUTED}Added to PATH in ${NC}$config_file"
    fi
}

if [[ "$no_modify_path" != "true" ]] && [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    current_shell=$(basename "$SHELL")
    case $current_shell in
        fish)
            config_file="$HOME/.config/fish/config.fish"
            [[ -f $config_file ]] && add_to_path "$config_file" "fish_add_path $INSTALL_DIR"
            ;;
        zsh)
            for f in "$HOME/.zshrc" "$HOME/.zshenv"; do
                [[ -f $f ]] && { add_to_path "$f" "export PATH=$INSTALL_DIR:\$PATH"; break; }
            done
            ;;
        bash)
            for f in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
                [[ -f $f ]] && { add_to_path "$f" "export PATH=$INSTALL_DIR:\$PATH"; break; }
            done
            ;;
        *)
            echo -e "${MUTED}Add to your shell config:${NC} export PATH=$INSTALL_DIR:\$PATH"
            ;;
    esac
fi

if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "$INSTALL_DIR" >> "$GITHUB_PATH"
fi

echo ""
echo -e "${GREEN}"
cat << 'EOF'
██╗  ██╗ █████╗      ██╗     ██╗██╗
██║ ██╔╝██╔══██╗     ██║     ██║██║
█████╔╝ ███████║     ██║     ██║██║
██╔═██╗ ██╔══██║██   ██║██   ██║██║
██║  ██╗██║  ██║╚█████╔╝╚█████╔╝██║
╚═╝  ╚═╝╚═╝  ╚═╝ ╚════╝  ╚════╝ ╚═╝
EOF
echo -e "${NC}"
echo -e "${GREEN}Installed successfully!${NC}"
echo ""
echo -e "${MUTED}To get started:${NC}"
echo "  cd <jj-repo>"
echo "  kajji"
echo ""
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo -e "${MUTED}Restart your shell or run:${NC}"
    echo "  export PATH=$INSTALL_DIR:\$PATH"
    echo ""
fi
