import SwiftUI
import TimelineCore

struct RecordingSettingsSection: View {
    @AppStorage(RecordingPolicy.enabledKey) private var enabled = true
    @AppStorage(RecordingPolicy.key) private var minimumSeconds = RecordingPolicy.defaultSeconds
    @State private var seconds = ""
    private var valid: Bool { Int(seconds).map { (1...RecordingPolicy.maximumSeconds).contains($0) } ?? false }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("计时").font(.title2.weight(.medium))
            Toggle("结束时忽略短计时", isOn: $enabled)
            if enabled {
                HStack {
                    Text("少于")
                    TextField("秒数", text: $seconds).textFieldStyle(.roundedBorder).frame(width: 64)
                        .accessibilityLabel("忽略短计时的秒数")
                        .onChange(of: seconds) { value in
                            if let number = Int(value), (1...RecordingPolicy.maximumSeconds).contains(number) { minimumSeconds = number }
                        }.onSubmit { if !valid { seconds = String(max(1, RecordingPolicy.seconds(minimumSeconds))) } }
                    Text("秒不保存")
                    Spacer()
                }
                if !valid { Text("请输入1–3600秒").font(.caption).foregroundStyle(.red) }
            }
            Text("只影响新计时，暂停时间不计入。").font(.caption).foregroundStyle(.secondary)
        }.onAppear { seconds = String(max(1, RecordingPolicy.seconds(minimumSeconds))) }
    }
}
