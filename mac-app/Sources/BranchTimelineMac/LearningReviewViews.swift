import SwiftUI
import TimelineCore

struct LearningProjectMenu: View {
    @ObservedObject var model: AppModel
    let path: String

    var body: some View {
        Menu {
            Button(model.learningProjects.contains(path) ? "关闭此项目的学习回顾" : "为此项目开启学习回顾") {
                model.setLearningProject(path, enabled: !model.learningProjects.contains(path))
            }
            Button(model.selectedLearningEnabled ? "仅本次关闭回顾" : "仅本次开启回顾") {
                model.learningOverride = !model.selectedLearningEnabled
            }
        } label: {
            Image(systemName: model.selectedLearningEnabled ? "brain.head.profile.fill" : "brain.head.profile")
                .foregroundStyle(model.selectedLearningEnabled ? AppPalette.blue : .secondary)
        }.menuStyle(.borderlessButton).menuIndicator(.hidden).fixedSize()
            .help(model.selectedLearningEnabled ? "学习回顾已开启" : "学习回顾已关闭")
            .accessibilityLabel("学习回顾")
    }
}

struct LearningReviewSettings: View {
    @AppStorage(LearningReviewPolicy.minimumKey) private var minimum = LearningReviewPolicy.defaultMinimum
    @AppStorage(LearningReviewPolicy.intervalKey) private var interval = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("学习回顾").font(.title2.weight(.medium))
            Stepper("最少 \(minimum) 个有效字", value: $minimum, in: 10...500, step: 5)
            Toggle("学习中也提醒", isOn: Binding(get: { interval > 0 }, set: { interval = $0 ? LearningReviewPolicy.defaultInterval : 0 }))
            if interval > 0 {
                Stepper("每 \(interval) 分钟有效计时提醒", value: $interval, in: 5...180, step: 5)
            }
        }
    }
}

struct LearningAnswerEditor: View {
    @Binding var answer: String
    let minimum: Int
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .trailing, spacing: 5) {
            TextEditor(text: $answer)
                .font(.body).frame(height: 106).padding(6)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                .accessibilityLabel("回顾回答").focused($focused)
                .onAppear { focused = true }
            if answer.count > LearningReviewPolicy.maxAnswer {
                Text("最多 \(LearningReviewPolicy.maxAnswer) 字").font(.caption).foregroundStyle(.red)
            } else {
                Text("\(LearningReviewPolicy.count(answer)) / \(minimum) 字")
                    .font(.caption).monospacedDigit().foregroundStyle(.secondary)
            }
        }
    }
}

struct LearningReviewView: View {
    @ObservedObject var model: AppModel
    let prompt: LearningPrompt
    @State private var answer = ""
    @State private var revealed = false

    private var policy: LearningReviewPolicy? {
        switch prompt {
        case .checkpoint: return model.active?.learningReview?.policy
        case .recall(_, let policy): return policy
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(heading).font(.headline)
            if case .recall(let record, _) = prompt {
                Text(record.title).font(.subheadline).foregroundStyle(.secondary)
            }
            if revealed, case .recall(let record, _) = prompt {
                ScrollView { Text(record.answer).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
                    .frame(maxHeight: 160)
            } else if let policy {
                Text(question).font(.callout)
                LearningAnswerEditor(answer: $answer, minimum: policy.minimum)
            }
            if let error = model.error { Text(error).font(.caption).foregroundStyle(.red) }
            HStack {
                Spacer()
                if revealed {
                    Button("继续") { model.learningPrompt = nil }.buttonStyle(.borderedProminent)
                } else {
                    Button(buttonTitle) { if model.submitLearning(answer, prompt: prompt) { revealed = true } }
                        .buttonStyle(.borderedProminent).disabled(policy?.accepts(answer) != true)
                }
            }
        }.padding(22).frame(width: 370).interactiveDismissDisabled()
    }

    private var heading: String {
        if case .recall = prompt { return revealed ? "上次的回答" : "隔天回顾" }
        return "学习回顾"
    }
    private var question: String {
        if case .recall = prompt { return "先不看旧回答。上次学到的内容，你还记得什么？" }
        return "先不看资料。用自己的话写下刚才学会了什么。"
    }
    private var buttonTitle: String {
        if case .recall = prompt { return "保存并核对" }
        return "保存回顾"
    }
}

struct LearningReminderButton: View {
    @ObservedObject var model: AppModel
    var body: some View {
        if model.learningCheckpointDue {
            Button { model.openLearningCheckpoint() } label: {
                Image(systemName: "text.bubble.fill").foregroundStyle(AppPalette.blue)
            }.buttonStyle(.plain).help("到回顾时间了").accessibilityLabel("打开学习回顾")
        }
    }
}
