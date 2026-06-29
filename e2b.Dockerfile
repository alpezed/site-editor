# E2B sandbox template for live-previewing user Next.js repos.
# Base ships Node 22 + npm; we enable corepack so pnpm/yarn work from lockfiles.
FROM e2bdev/code-interpreter:latest

RUN corepack enable \
 && corepack prepare pnpm@latest --activate \
 && corepack prepare yarn@stable --activate

# Don't pin WORKDIR to /home/user/app: the driver does `rm -rf` on that dir
# before cloning, and deleting the shell's own cwd breaks git's getcwd().
WORKDIR /home/user
