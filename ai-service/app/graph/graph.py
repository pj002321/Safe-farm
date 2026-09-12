from langgraph.graph import END, START, StateGraph

from app.graph import nodes
from app.graph.state import GraphState

def build_graph():
    builder = StateGraph(GraphState)

    builder.add_node("retrieve", nodes.retrieve)
    builder.add_node("generate", nodes.generate)

    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve","generate")
    builder.add_edge("generate", END)

    return builder.compile()


graph = build_graph()