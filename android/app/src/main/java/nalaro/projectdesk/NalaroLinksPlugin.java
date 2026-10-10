package nalaro.projectdesk;

import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NalaroLinks")
public class NalaroLinksPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String raw = call.getString("url");
        if (raw == null) { call.reject("URL is required"); return; }
        Uri uri = Uri.parse(raw);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getHost().isEmpty()
                || uri.getUserInfo() != null) {
            call.reject("Only HTTPS external links are supported");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No web browser is installed", error);
        }
    }
}
