---
title: CSV parser rewrite
status: "active"
started: "2026-08-10"
tags: [rust, performance]
---

Rewriting a Python CSV parser in Rust as a way to learn the language on
familiar ground.

## Why
The Python version is the slowest step in a pipeline that otherwise runs in
seconds. It is also small enough to hold in my head, which makes it a good
first real Rust project.

## Progress
- [x] Tokenizer
- [x] Quoted-field handling
- [ ] Streaming reader
- [ ] Benchmarks against the original
