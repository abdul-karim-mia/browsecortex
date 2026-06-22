#!/bin/bash
set -e

# BrowseCortex release helper script
# Usage: ./scripts/release.sh [major|minor|patch]

BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: ./scripts/release.sh [major|minor|patch]"
  exit 1
fi

echo "📦 BrowseCortex Release Helper"
echo "Bump type: $BUMP_TYPE"
echo ""

# Check git status
if [[ -n $(git status -s) ]]; then
  echo "❌ Working directory has uncommitted changes. Please commit first."
  exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Parse version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
RELEASE_DATE=$(date -u +%Y-%m-%d)

echo "New version: $NEW_VERSION"
echo "Release date: $RELEASE_DATE"
echo ""

# Confirm
read -p "Continue with release v$NEW_VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Release cancelled."
  exit 1
fi

# Update versions across ALL sources (Chrome reads manifest.json; the build
# embeds VERSION; the landing package has its own version too).
echo "📝 Updating version files..."
npm version $NEW_VERSION --no-git-tag-version
(cd packages/relay && npm version $NEW_VERSION --no-git-tag-version)
(cd packages/extension && npm version $NEW_VERSION --no-git-tag-version 2>/dev/null || true)
(cd packages/landing && npm version $NEW_VERSION --no-git-tag-version 2>/dev/null || true)

# manifest.json — Chrome's source of truth for the extension version.
node -e "const f='packages/extension/manifest.json';const m=require('./'+f);m.version='$NEW_VERSION';require('fs').writeFileSync(f, JSON.stringify(m,null,2)+'\n');"

# VERSION file — consumed by build-time version embedding.
echo "$NEW_VERSION" > VERSION

# Update CHANGELOG
echo "📋 Updating CHANGELOG.md..."
sed -i.bak "s/## \[Unreleased\]/## [$NEW_VERSION] - $RELEASE_DATE/g" CHANGELOG.md
sed -i.bak "/^## \[$NEW_VERSION\]/i \\
## [Unreleased]\\
\\
### Added
" CHANGELOG.md

# Rewrite the reference links. Match the WHOLE `[Unreleased]:` line (anchored,
# `.*` to the end) and replace it — matching only the prefix leaves the old
# `/compare/...HEAD` suffix dangling, which is what corrupted past CHANGELOGs.
REPO="https://github.com/abdul-karim-mia/browsecortex"
NEW_LINK="[Unreleased]: $REPO/compare/v$NEW_VERSION...HEAD\\
[$NEW_VERSION]: $REPO/compare/v$CURRENT_VERSION...v$NEW_VERSION"
sed -i.bak "s|^\[Unreleased\]:.*\$|$NEW_LINK|" CHANGELOG.md
rm -f CHANGELOG.md.bak

# Commit and tag
echo "🔗 Creating commit and tag..."
git config user.name "$(git config user.name || echo 'Release Bot')"
git config user.email "$(git config user.email || echo 'release@browsecortex.dev')"

git add package.json packages/*/package.json packages/extension/manifest.json CHANGELOG.md VERSION
git commit -m "chore(release): v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo "✅ Release v$NEW_VERSION created!"
echo ""
echo "Next steps:"
echo "1. Review the commit and tag: git log -1 && git tag -l v$NEW_VERSION"
echo "2. Push to GitHub: git push origin main && git push origin v$NEW_VERSION"
echo "3. Create release on GitHub (optional): gh release create v$NEW_VERSION -F CHANGELOG_RELEASE.md"
echo ""
