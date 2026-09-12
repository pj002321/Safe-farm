# AGENTS.md

<!-- agents.md 공개 스펙 파일. Claude Code 외 다른 AI 코딩 도구(Cursor, Codex, Aider, Gemini CLI 등)도 이 파일을 읽는다.
     이 저장소에서는 "도구 무관 공통 지침"만 여기 쓰고, Claude Code 전용 사항은 CLAUDE.md에 남긴다.
     (지금 CLAUDE.md 는 `@AGENTS.md` 한 줄짜리 포인터다.) -->

## Overview
프로젝트에 필요한 임베딩 및 LLM 기능 구축

## Setup / commands

## Code style
디자인패턴을 준수하고, 파일에서 정해진 역할외에 의존성을 어기지않는 코드 설계를 한다.
함수 인자값에는 자료형을 명시하고 (doc : str), 핵심 주석을 간단 명료하게 작성한다.
코드 네이밍을 규격화하고 모두가 읽기 편한 방식으로 구조를 설계한다.

## Testing instructions

데이터 정합성을 검사하며, 사용자 쿼리에 따른 응답의 질을 높히는 것을 목표로한다.
청킹과 임베드 품질 향상에 중점을 두어 테스트를 통해 개선한다.

## Commit / PR guidelines

사용자가 직접 git 에 접근하며, Agent는 Commit, Push는 하지않는다.

## Architecture
app/
├── core/          # 설정, DB 연결 (공통 인프라)
├── models/        # SQLAlchemy 테이블 정의 (Document, Chunk)
├── knowledge/      # RAG 런타임 로직 (chunk 분리, 임베딩 호출, 벡터 저장/검색)
├── graph/          # LangGraph 오케스트레이션 (state, node, edge)
├── domain/         # 프레임워크 무관 순수 로직 (작물 적합도 판정 등)
├── api/, schemas/  # FastAPI 엔드포인트 + 요청/응답 스키마
└── main.py         # FastAPI 앱 진입점

pipeline/          # 오프라인 배치 스크립트 (load → chunk → embed 순 CLI)
## Logging