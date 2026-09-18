"""LLM function-calling에 넘길 도구 목록. 실행 로직은 없다 — 스펙 선언뿐이다.
실제 실행은 app/graph/nodes.py의 run_tools가 이름을 보고 매칭해서 한다.
"""

TOOL_SPECS = [
    {
        "type": "function",
        "function": {
            "name": "get_plot_context",
            "description": "이 밭의 작물·생육단계·최근 기상 정보를 가져온다. 물주기·생육상태처럼 이 밭 상황에 관한 질문에 쓴다.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]