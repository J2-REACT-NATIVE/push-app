import { useState, useEffect } from "react";
import { Text, View, Button, Platform, FlatList } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { ThemedText } from "@/components/themed-text";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export default function App() {
  const { expoPushToken, notifications, sendPushNotification } =
    usePushNotifications();
  console.log({ notifications });
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "space-around" }}
    >
      <ThemedText>Your Expo push token: {expoPushToken}</ThemedText>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.request.identifier}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10 }}>
            <ThemedText style={{ fontWeight: 'bold' }}>
              {item.request.content.title}
            </ThemedText>
            <ThemedText>{item.request.content.body}</ThemedText>
            <ThemedText>
              {JSON.stringify(item.request.content.data, null, 2)}
            </ThemedText>
          </View>
        )}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: 'grey', opacity: 0.5 }} />
        )}
        //! Cuando la lista esta vacia
        ListEmptyComponent={() => (
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: 20,
            }}
          >
            <ThemedText
              style={{ textAlign: 'center', fontSize: 16, color: 'grey' }}
            >
              No hay notificaciones
            </ThemedText>
          </View>
        )}
      />

      {/* <Button
        title="Press to Send Notification"
        onPress={async () => {
          await sendPushNotification({
            title: "titulo desde la app",
            body: "body desde la app",
            to: [expoPushToken],
            data : {
                chatId:"abc-123"
            }
          });
        }}
      /> */}
    </View>
  );
}
