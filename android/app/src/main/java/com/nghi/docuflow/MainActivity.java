package com.nghi.docuflow;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.InputStream;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIncomingIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return;

        Uri uri = intent.getData();
        if (uri == null) return;

        try {
            String base64 = readFileFromUri(uri);
            if (base64 == null) return;

            String fileName = resolveFileName(uri);
            String mimeType = intent.getType();
            if (mimeType == null) {
                mimeType = getContentResolver().getType(uri);
            }
            if (mimeType == null) mimeType = "application/octet-stream";

            final JSONObject json = new JSONObject();
            json.put("name", fileName);
            json.put("mimeType", mimeType);
            json.put("base64", base64);
            json.put("size", (long)(base64.length() * 3 / 4));

            final String script =
                    "window.__pendingIntentFile = " + json.toString() + ";" +
                            "window.dispatchEvent(new CustomEvent('docreader:intent-file', {" +
                            "  detail: " + json.toString() +
                            "}));";

            getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(script, null)
            );

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private String readFileFromUri(Uri uri) {
        try {
            InputStream stream = getContentResolver().openInputStream(uri);
            if (stream == null) return null;
            byte[] bytes = stream.readAllBytes();
            stream.close();
            return Base64.encodeToString(bytes, Base64.NO_WRAP);
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    private String resolveFileName(Uri uri) {
        // Thử lấy tên thật từ ContentResolver
        try {
            Cursor cursor = getContentResolver().query(
                    uri, null, null, null, null
            );
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    cursor.close();
                    if (name != null && !name.isEmpty()) return name;
                }
                cursor.close();
            }
        } catch (Exception ignored) {}

        // Fallback: lấy từ path URI
        String lastSegment = uri.getLastPathSegment();
        if (lastSegment != null) {
            return lastSegment.substring(lastSegment.lastIndexOf('/') + 1);
        }
        return "document";
    }
}