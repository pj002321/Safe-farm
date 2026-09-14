from app.knowledge.retriever import retrieve as retrieve_chunks
from app.graph.state import GraphState

def retrieve(state: GraphState) -> dict:
    docu = retrieve_chunks(state["db"], state["question"])
    return {"documents": docu}

def generate(state: GraphState) -> dict:
    """TODO: state["documents"]를 근거로 LLM 호출해서 답변 생성"""
    raise NotImplementedError

