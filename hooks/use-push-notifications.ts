import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Href, router, useRootNavigationState } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";



// Esto es una configuracion que puede declararse de forma global
//! se configura las notificaciones
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

//! se envia la notificcion push a los servidores de expo
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

//! Si no se puede registar la notificacion Push
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
  //!Vewrifica el permiso que tiene el usuario para recibir notificaciones
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    //Si el usuario no ha concedido el permiso se le vuelve a solicitar (vuelve a recibir elprompt)
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  //! si no es otorgado el permiso se llamma a handleRegistrationError
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
    //!imprimimos
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
  //! Ultima notificacion tocada. Cubre tambien el arranque en frio (app terminada),
  //! porque el hook usa useLayoutEffect y ademas escucha las respuestas posteriores.
  const lastNotificationResponse = Notifications.useLastNotificationResponse();
  //! Obtiene token del dispositivo del usuario
  const [expoPushToken, setExpoPushToken] = useState("");
  const [notifications, setNotifications] = useState<
    Notifications.Notification[]
  >([]);

  useEffect(() => {
    //!Registramos el token en expoPushToken
    registerForPushNotificationsAsync()
      .then((token) => setExpoPushToken(token ?? ""))
      .catch((error: any) => setExpoPushToken(`${error}`));
  }, []);

  useEffect(() => {
    //! registramos los listeners
    const notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        //notifications es un array del tipo Notifications.Notification[]
        setNotifications((prevNotifications) => [
          notification, // nueva notificacion
          ...prevNotifications, // las anteriores
        ]);
      },
    );
    return () => {
      notificationListener.remove();
    };
  }, []);

  //! reacciona cuando se toca una notificacion, en segundo plano y en arranque en frio
  useEffect(() => {
    if (!lastNotificationResponse) return;

    const chatId =
      lastNotificationResponse.notification.request.content.data?.chatId;
    if (typeof chatId === "string" && chatId.length > 0) {
      setPendingChatId(chatId);
    }
  }, [lastNotificationResponse]);

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
