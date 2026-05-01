# Security Policy

## Reporting a Vulnerability

Do not open a public GitHub issue for vulnerabilities, leaked credentials, or provider-account exposure.

Email the maintainer at <mariusndale@gmail.com> with:

- affected version or commit
- summary of the issue
- reproduction steps
- impact assessment
- any relevant logs with secrets removed

The maintainer will acknowledge the report, investigate, and coordinate a fix before public disclosure.

## Secret Handling

Assembler stores provider credential references in the local `.assembler/state.db` file for the project where it runs. Do not commit `.assembler/`, `.env`, `.env.local`, provider tokens, or live connection strings.
