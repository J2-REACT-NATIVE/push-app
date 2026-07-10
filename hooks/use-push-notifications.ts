import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Href, router, useRootNavigationState } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface SendPushOptions {
  to: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
}

async function sendPushNotification(options: SendPushOptions) {
  const { to, title, body, data } = options;

  const message = {
    to: to,
    sound: "default",
    title: title,
    body: body,
    data: data,
  };

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
}

function handleRegistrationError(errorMessage: string) {
  alert(errorMessage);
  throw new Error(errorMessage);
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    handleRegistrationError(
      "Permission not granted to get push token for push notification!",
    );
    return;
  }
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;
  if (!projectId) {
    handleRegistrationError("Project ID not found");
  }
  try {
    const pushTokenString = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
    console.log({ [Platform.OS]: pushTokenString });
    return pushTokenString;
  } catch (e: unknown) {
    handleRegistrationError(`${e}`);
  }
}

export const usePushNotifications = () => {
  const [pendingChatId, setPendingChatId] = useState<string | null>("");
  //nos puede indicar cuando la aplicacion ya esta montada y lista para ser usada
  const rootNavigationState = useRootNavigationState();

  const [expoPushToken, setExpoPushToken] = useState("");
  const [notifications, setNotifications] = useState<
    Notifications.Notification[]
  >([]);

  useEffect(() => {
    registerForPushNotificationsAsync()
      .then((token) => setExpoPushToken(token ?? ""))
      .catch((error: any) => setExpoPushToken(`${error}`));
  }, []);

  useEffect(() => {
    const notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        setNotifications((prevNotifications) => [
          notification,
          ...prevNotifications,
        ]);
      },
    );
    //! reacciona cuando se toca una notificacion
    const responseListener =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("addNotificationResponseReceivedListener:");
        console.log(response);
        const chatId = response.notification.request.content.data?.chatId;
        if (typeof chatId === "string" && chatId.length > 0) {
          setPendingChatId(chatId);
        }
      });
    //! Implementar funcion cuando la app esta terminada.
    const handleInitialNotificationResponse = () => {
        //tomamos la ultima notificacion recibida
      const response = Notifications.getLastNotificationResponse();

      const chatId = response?.notification?.request?.content?.data?.chatId;
      if (typeof chatId === "string" && chatId.length > 0) {
        setPendingChatId(chatId);
      }
    };
    //! Cuando se monte el componente que llame inmendiatamente al siguiente metodo.
    handleInitialNotificationResponse();
    //Implementar funcion cuando la app esta terminada.
    return () => {
      notificationListener.remove();
      responseListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!rootNavigationState.key) return;
    if (!pendingChatId) return;

    // Push using a concrete path string to satisfy the router typings
    router.push(`/chat/${pendingChatId}` as  Href) ;
    setPendingChatId(null);
  }, [pendingChatId, rootNavigationState?.key]);

  return {
    // Props
    expoPushToken,
    notifications,

    // Methods
    sendPushNotification,
  };
};
