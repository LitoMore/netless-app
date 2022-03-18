import { faker } from "@faker-js/faker";

import { WindowManager } from "@netless/window-manager";
import type { Room } from "white-web-sdk";
import { ApplianceNames, DeviceType, WhiteWebSdk } from "white-web-sdk";

import { store, type RoomInfo } from "./common";
import { clearQueryString, createRoom, env, persistStore } from "./common";

export const sdk = new WhiteWebSdk({
  appIdentifier: env.VITE_APPID,
  useMobXState: true,
  deviceType: DeviceType.Surface,
});

export async function prepare(): Promise<RoomInfo | undefined> {
  let uuid: string | undefined;
  let roomToken: string | undefined;

  const query = new URLSearchParams(location.search);
  if (query.has("uuid") && query.has("roomToken")) {
    uuid = query.get("uuid") as string;
    roomToken = query.get("roomToken") as string;
  }

  if (!uuid || !roomToken) {
    const rooms = JSON.parse(persistStore.getItem("rooms") || "[]");
    if (rooms[0]) {
      ({ uuid, roomToken } = rooms[0]);
    }
  }

  if (!uuid || !roomToken) {
    uuid = env.VITE_ROOM_UUID;
    roomToken = env.VITE_ROOM_TOKEN;
  }

  if ((!uuid || !roomToken) && env.VITE_TOKEN) {
    const shouldCreateRoom = window.confirm(
      "Not found uuid/roomToken both in query and localStorage, create a new one?"
    );
    if (shouldCreateRoom) {
      ({ uuid, roomToken } = await createRoom());
      location.reload();
    }
  }

  if (!uuid || !roomToken) {
    return undefined;
  }

  return { uuid, roomToken };
}

export async function joinRoom(info: RoomInfo): Promise<Room> {
  let uid = sessionStorage.getItem("uid");
  if (!uid) {
    uid = faker.datatype.uuid();
    sessionStorage.setItem("uid", uid);
  }
  const room = await sdk.joinRoom({
    ...info,
    uid,
    invisiblePlugins: [WindowManager],
    useMultiViews: true,
    disableNewPencil: false,
    disableMagixEventDispatchLimit: true,
    floatBar: true,
    userPayload: {
      uid,
      nickName: faker.name.firstName(),
    },
  });
  window.room = room;
  clearQueryString();
  return room;
}

export async function reset({
  manager = window.manager,
  room = window.room,
  clearScreen = false,
  reload = false,
} = {}): Promise<void> {
  // close all apps
  await Promise.all(Object.keys(manager.apps || {}).map(appId => manager.closeApp(appId)));
  // clear attributes
  Object.keys(manager.attributes).forEach(key => {
    // {kind}-{nanoid(8)}
    if (/-[-_a-zA-Z0-9]{8}$/.test(key)) {
      manager.updateAttributes([key], undefined);
    } else if (key === "apps") {
      manager.updateAttributes([key], {});
    }
  });
  // reset camera
  manager.mainView.moveCamera({ centerX: 0, centerY: 0, scale: 1 });
  // clear screen
  if (clearScreen) {
    room.cleanCurrentScene();
  }
  // reload page
  if (reload) {
    location.reload();
  }
}

export function init(container: HTMLElement) {
  WindowManager.mount({
    room,
    container,
    chessboard: false,
    cursor: true,
    debug: true,
    prefersColorScheme: "auto",
  }).then(async manager => {
    window.manager = manager;
    await manager.switchMainViewToWriter();
    const tool = store.getItem("currentApplianceName") as ApplianceNames;
    if (tool) {
      manager.mainView.setMemberState({ currentApplianceName: tool });
    }
  });
}

export const tools = Object.values(ApplianceNames);
