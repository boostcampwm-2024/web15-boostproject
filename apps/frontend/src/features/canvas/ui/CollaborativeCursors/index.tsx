import { useMemo } from "react";
import { Panel } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import Cursor from "@/components/commons/cursor";

import useUserStore from "@/store/useUserStore";
import { AwarenessState } from "../../model/useCollaborativeCursors";

interface CollaborativeCursorsProps {
  cursors: Map<number, AwarenessState>;
}

export function CollaborativeCursors({ cursors }: CollaborativeCursorsProps) {
  const { flowToScreenPosition } = useReactFlow();
  const { currentUser } = useUserStore();
  const validCursors = useMemo(
    () =>
      Array.from(cursors.values()).filter(
        (cursor) =>
          cursor.cursor &&
          (cursor.clientId as unknown as string) !== currentUser.clientId,
      ),
    [cursors],
  );

  return (
    <Panel>
      {validCursors.map((cursor) => (
        <Cursor
          key={cursor.clientId}
          coors={flowToScreenPosition({
            x: cursor.cursor!.x,
            y: cursor.cursor!.y,
          })}
          color={cursor.color}
          clientId={cursor.clientId.toString()}
        />
      ))}
    </Panel>
  );
}
