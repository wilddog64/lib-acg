# Bug: AWS credential test calls an undefined `_sts_valid` helper

## What was tested

Ran the repaired session detector through the original AWS credential-test command:

```text
make credential-test PROVIDER=aws
```

## Actual output

```text
INFO: AWS credentials written to ~/.aws/credentials [default]
bin/acg-credential-test: line 277: _sts_valid: command not found
WARN: sts:GetCallerIdentity failed — restarting sandbox for fresh credentials...
```

## Root cause

`bin/acg-credential-test` invokes `_sts_valid` after writing extracted AWS credentials, but the
helper is no longer defined. Under the negated conditional this is treated as a failed STS
validation and unnecessarily restarts the sandbox.

## Fix

Use the canonical inline STS probe already used by the final credential gate:

```bash
AWS_CONFIG_FILE=/dev/null aws sts get-caller-identity >/dev/null 2>&1
```

## Recommended follow-up

Add a focused shell-level test that exercises the first AWS validation branch, so undefined
helpers cannot masquerade as cloud authentication failures.
