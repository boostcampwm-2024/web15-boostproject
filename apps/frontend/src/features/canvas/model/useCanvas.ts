import { useCallback, useRef, useEffect } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  NodeChange,
  Edge,
  EdgeChange,
  Connection,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SocketIOProvider } from "y-socket.io";
import { useQueryClient } from "@tanstack/react-query";

import { usePages } from "@/features/pageSidebar/api/usePages";
import useYDocStore from "@/shared/model/ydocStore";
import { calculateBestHandles } from "@/features/canvas/model/calculateHandles";
import { createSocketIOProvider } from "@/shared/api/socketProvider";
import { useCollaborativeCursors } from "./useCollaborativeCursors";
import { getSortedNodes } from "./sortNodes";
import { usePageStore } from "@/features/pageSidebar/model/pageStore";
import { useWorkspace } from "@/shared/lib/useWorkspace";
import { getAbsolutePosition, getRelativePosition } from "./getPosition";

export interface YNode extends Node {
  isHolding: boolean;
  parentId?: string;
}

export const useCanvas = () => {
  const { zoom } = useViewport();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { pages } = usePages();
  const queryClient = useQueryClient();
  const { ydoc } = useYDocStore();
  const { getIntersectingNodes } = useReactFlow();

  const workspace = useWorkspace();

  const { cursors, handleMouseMove, handleNodeDrag, handleMouseLeave } =
    useCollaborativeCursors({
      ydoc,
      roomName: `flow-room-${workspace}`,
    });

  const provider = useRef<SocketIOProvider>();
  const existingPageIds = useRef(new Set<string>());
  const holdingNodeRef = useRef<string | null>(null);

  const currentPage = usePageStore((state) => state.currentPage);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (currentPage) {
      setTimeout(() => {
        fitView({
          nodes: [{ id: currentPage.toString() }],
          duration: 500,
          padding: 0.5,
          maxZoom: zoom,
        });
      }, 100);
    }
  }, [currentPage, fitView]);

  useEffect(() => {
    const yTitleMap = ydoc.getMap("title");
    const yEmojiMap = ydoc.getMap("emoji");
    const nodesMap = ydoc.getMap("nodes");

    yTitleMap.observeDeep((event) => {
      if (!event[0].path.length) return;
      const pageId = event[0].path[0].toString().split("_")[1];
      const value = event[0].target.toString();
      const existingNode = nodesMap.get(pageId) as YNode;

      const newNode: YNode = {
        ...existingNode,
        data: { ...existingNode.data, title: value },
        isHolding: false,
      };

      nodesMap.set(pageId, newNode);
    });

    yEmojiMap.observeDeep((event) => {
      if (!event[0].path.length) return;
      const pageId = event[0].path[0].toString().split("_")[1];
      const value = event[0].target.toString();
      const existingNode = nodesMap.get(pageId) as YNode;

      const newNode: YNode = {
        ...existingNode,
        data: { ...existingNode.data, emoji: value },
        isHolding: false,
      };

      nodesMap.set(pageId, newNode);
    });
  }, []);

  useEffect(() => {
    if (!ydoc) return;

    const wsProvider = createSocketIOProvider("flow-room", ydoc);
    provider.current = wsProvider;

    const nodesMap = ydoc.getMap("nodes");
    const edgesMap = ydoc.getMap("edges");

    const yNodes = Array.from(nodesMap.values()) as YNode[];

    const initialNodes = yNodes.map((yNode) => {
      const { isHolding, ...rest } = yNode;
      // esline룰 통과를 위한 일시적인 로그
      console.log(isHolding);
      return rest;
    });

    setNodes(initialNodes);

    let isInitialSync = true;

    nodesMap.observe((event) => {
      if (isInitialSync) {
        isInitialSync = false;
        return;
      }

      event.changes.keys.forEach((change, key) => {
        const nodeId = key;
        if (change.action === "add" || change.action === "update") {
          const updatedYNode = nodesMap.get(nodeId) as YNode;
          const { isHolding, ...updatedNode } = updatedYNode;
          // esline룰 통과를 위한 일시적인 로그
          console.log(isHolding);

          if (change.action === "add") {
            queryClient.invalidateQueries({ queryKey: ["pages"] });
          }

          setNodes((nds) => {
            const index = nds.findIndex((n) => n.id === nodeId);
            if (index === -1) {
              return [...nds, updatedNode];
            }
            const newNodes = [...nds];
            newNodes[index] = {
              ...updatedNode,
              selected: newNodes[index].selected,
            };

            const groups = newNodes.filter((n) => n.type === "group");
            const notes = newNodes.filter((n) => n.type !== "group");
            return [...groups, ...notes];
          });
        } else if (change.action === "delete") {
          setNodes((nds) => nds.filter((n) => n.id !== nodeId));
          queryClient.invalidateQueries({ queryKey: ["pages"] });
        }
      });
    });

    edgesMap.observe(() => {
      const yEdges = Array.from(edgesMap.values()) as Edge[];
      setEdges(yEdges);
    });

    return () => {
      wsProvider.destroy();
    };
  }, [ydoc, queryClient]);

  useEffect(() => {
    if (!pages || !ydoc) return;

    const nodesMap = ydoc.getMap("nodes");
    const currentPageIds = new Set(pages.map((page) => page.id.toString()));

    existingPageIds.current.forEach((pageId) => {
      if (!currentPageIds.has(pageId)) {
        nodesMap.delete(pageId);
        existingPageIds.current.delete(pageId);
      }
    });

    pages.forEach((page) => {
      const pageId = page.id.toString();
      const existingNode = nodesMap.get(pageId) as YNode | undefined;

      if (existingNode) {
        nodesMap.set(pageId, {
          ...existingNode,
          data: {
            title: page.title,
            id: page.id,
            emoji: page.emoji,
          },
        });
      } else {
        const newNode: YNode = {
          id: pageId,
          type: "note",
          data: {
            title: page.title,
            id: page.id,
            emoji: page.emoji,
          },
          position: {
            x: Math.random() * 500,
            y: Math.random() * 500,
          },
          selected: false,
          isHolding: false,
        };
        nodesMap.set(pageId, newNode);
      }

      existingPageIds.current.add(pageId);
    });
  }, [pages, ydoc]);

  const sortNodes = async () => {
    const sortedNodes = await getSortedNodes(nodes, edges);
    const nodesMap = ydoc.getMap("nodes");

    sortedNodes.forEach((updateNode) => {
      nodesMap.set(updateNode.id, updateNode);
    });

    setNodes(sortedNodes);
  };

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!ydoc) return;
      const nodesMap = ydoc.getMap("nodes");
      const edgesMap = ydoc.getMap("edges");

      changes.forEach((change) => {
        if (change.type === "position" && change.position) {
          const node = nodes.find((n) => n.id === change.id);
          if (node) {
            onNodesChange([change]);

            const currentNode = nodes.find((n) => n.id === change.id);
            if (currentNode) {
              nodesMap.set(change.id, {
                ...currentNode,
                position: change.position,
                selected: false,
                isHolding: holdingNodeRef.current === change.id,
              });
            }

            const affectedEdges = edges.filter(
              (edge) => edge.source === change.id || edge.target === change.id,
            );

            affectedEdges.forEach((edge) => {
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);

              if (sourceNode && targetNode) {
                const bestHandles = calculateBestHandles(
                  sourceNode,
                  targetNode,
                  nodes,
                );
                const updatedEdge = {
                  ...edge,
                  sourceHandle: bestHandles.source,
                  targetHandle: bestHandles.target,
                };
                edgesMap.set(edge.id, updatedEdge);
              }
            });
          }
        } else if (change.type === "dimensions" && change.dimensions) {
          const currentNode = nodes.find((n) => n.id === change.id);
          if (currentNode && currentNode.type === "group") {
            nodesMap.set(change.id, {
              ...currentNode,
              dimensions: change.dimensions,
              selected: false,
              isHolding: holdingNodeRef.current === change.id,
            });
          }
          onNodesChange([change]);
        } else {
          onNodesChange([change]);
        }
      });
    },
    [nodes, edges, onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!ydoc) return;
      const edgesMap = ydoc.getMap("edges");

      changes.forEach((change) => {
        if (change.type === "remove") {
          edgesMap.delete(change.id);
        }
      });

      onEdgesChange(changes);
    },
    [onEdgesChange, ydoc],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !ydoc) return;

      const isConnected = edges.some(
        (edge) =>
          (edge.source === connection.source &&
            edge.target === connection.target) ||
          (edge.source === connection.target &&
            edge.target === connection.source),
      );

      if (isConnected) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (sourceNode && targetNode) {
        const bestHandles = calculateBestHandles(sourceNode, targetNode, nodes);
        const newEdge: Edge = {
          id: `e${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: bestHandles.source,
          targetHandle: bestHandles.target,
        };

        ydoc.getMap("edges").set(newEdge.id, newEdge);
        setEdges((eds) => addEdge(newEdge, eds));
      }
    },
    [setEdges, edges, nodes, ydoc],
  );

  const onNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      holdingNodeRef.current = node.id;
    },
    [],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!ydoc) return;

      const nodesMap = ydoc.getMap("nodes");
      const yNode = nodesMap.get(node.id) as YNode | undefined;

      if (!yNode) return;

      const currentNode = nodes.find((n) => n.id === node.id);
      if (!currentNode) return;

      if (node.type === "group") {
        const intersectingNotes = getIntersectingNodes(currentNode).filter(
          (n) => n.type === "note" && !n.parentId,
        );

        intersectingNotes.forEach((noteNode) => {
          nodesMap.set(noteNode.id, {
            ...noteNode,
            parentId: node.id,
            position: getRelativePosition(noteNode, currentNode),
            isHolding: false,
          });
        });

        nodesMap.set(node.id, {
          ...currentNode,
          isHolding: false,
        });

        const childNodes = nodes.filter((n) => n.parentId === node.id);
        const edgesMap = ydoc.getMap("edges");

        childNodes.forEach((childNode) => {
          const connectedEdges = edges.filter(
            (edge) =>
              edge.source === childNode.id || edge.target === childNode.id,
          );

          connectedEdges.forEach((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);

            if (sourceNode && targetNode) {
              const bestHandles = calculateBestHandles(
                sourceNode,
                targetNode,
                nodes,
              );
              const updatedEdge = {
                ...edge,
                sourceHandle: bestHandles.source,
                targetHandle: bestHandles.target,
              };
              edgesMap.set(edge.id, updatedEdge);
            }
          });
        });
      } else {
        const intersectingGroups = getIntersectingNodes(currentNode).filter(
          (n) => n.type === "group",
        );

        if (intersectingGroups.length > 0) {
          const parentNode = intersectingGroups[intersectingGroups.length - 1];

          if (yNode.parentId === parentNode.id) {
            nodesMap.set(node.id, {
              ...yNode,
              position: currentNode.position,
              isHolding: false,
            });
          } else {
            const absolutePosition = yNode.parentId
              ? getAbsolutePosition(
                  currentNode,
                  nodes.find((n) => n.id === yNode.parentId)!,
                )
              : currentNode.position;

            nodesMap.set(node.id, {
              ...currentNode,
              parentId: parentNode.id,
              position: getRelativePosition(
                { ...currentNode, position: absolutePosition },
                parentNode,
              ),
              isHolding: false,
            });
          }
        } else {
          if (yNode.parentId) {
            const oldParentNode = nodes.find((n) => n.id === yNode.parentId);
            if (oldParentNode) {
              nodesMap.set(node.id, {
                ...currentNode,
                parentId: undefined,
                position: getAbsolutePosition(currentNode, oldParentNode),
                isHolding: false,
              });
            }
          } else {
            nodesMap.set(node.id, {
              ...currentNode,
              parentId: undefined,
              isHolding: false,
            });
          }
        }
      }

      setNodes((ns) => {
        const groups = ns.filter((n) => n.type === "group");
        const notes = ns.filter((n) => n.type !== "group");
        return [...groups, ...notes];
      });
    },
    [ydoc, getIntersectingNodes, nodes, setNodes],
  );
  return {
    handleMouseMove,
    nodes,
    edges,
    handleNodesChange,
    handleEdgesChange,
    handleMouseLeave,
    handleNodeDrag,
    onNodeDragStart,
    onNodeDragStop,
    onConnect,
    sortNodes,
    cursors,
  };
};
