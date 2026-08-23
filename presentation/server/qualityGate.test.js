import test from "node:test";
import assert from "node:assert/strict";
import { assessTeachingQuality, assertTeachingQuality } from "./qualityGate.js";

function makeProject(narration, distinct = false) {
  const angles = [
    "先从用户为什么会遇到这个问题讲起，重点是说明旧方法在哪一个环节开始失效，以及这个新概念减少了哪一种重复劳动。",
    "定义不能只背名词，还要交代它和相邻概念的边界，观众要能用自己的话说出它负责什么、不负责什么。",
    "机制这一屏展示输入如何被识别、拆分和排序，重点不是列动作，而是说明前一步的结果为什么会决定后一步。",
    "当任务进入工具调用时，要展示请求、返回和可检查证据，不能只说系统调用了工具却不解释返回值改变了什么。",
    "生活类比用厨房助手说明目标、食材、工具和试味之间的关系，让抽象系统对应到观众已经熟悉的经验。",
    "工作场景用活动运营举例，具体说明报名页、表单数据、提醒邮件和反馈指标如何串成一个连续任务。",
    "另一个例子放在客服分流，先识别用户问题，再查知识库，最后决定直接回复还是创建工单，三步的责任不同。",
    "判断结果不能靠感觉，应该回到数字、记录或产物，说明什么证据可以证明动作有效，什么证据说明需要返工。",
    "反馈机制要讲清楚失败不是终点，系统会根据缺口调整下一步，但调整之前必须知道缺口来自数据还是目标本身。",
    "记忆能力的价值在于保存完成状态、当前阻塞和下一步，而不是简单保存一段聊天记录，三者缺一不可。",
    "权限边界要具体到发送邮件、修改页面、读取隐私数据和确认金额，哪些可以自动做，哪些必须交还给人。",
    "常见误区是把能调用工具等同于能承担责任，工具只负责动作，目标、授权和最终判断仍然需要明确的拥有者。",
    "适用范围应该优先选择规则稳定、结果可验收和重复度高的任务，开放式判断与高风险承诺不能直接照搬相同流程。",
    "复述测试要求观众能够说出一个输入、三步过程、一个证据和一个边界，这比记住一句漂亮定义更能证明理解。",
    "最后把问题、定义、机制、例子、边界重新串起来，形成可迁移的五问框架，让观众遇到新主题也能自己拆解。",
  ];
  return {
    chapters: Array.from({ length: 5 }, (_, chapterIndex) => ({
      id: `chapter-${chapterIndex}`,
      steps: Array.from({ length: 3 }, (_, stepIndex) => `屏幕重点 ${chapterIndex + 1}-${stepIndex + 1}`),
      narrations: Array.from({ length: 3 }, (_, stepIndex) => distinct
        ? `${angles[chapterIndex * 3 + stepIndex]} `.repeat(4)
        : narration),
    })),
  };
}

test("quality gate rejects repeated screen copy and adjacent narration", () => {
  const narration = "这是一个足够完整的讲解。先解释问题，再说明机制，然后用例验证，最后补充边界和人工确认。这里还要说明输入如何进入系统，系统如何分解任务，为什么这个步骤会改变结果，以及观众在真实场景中应当观察哪一个证据。".repeat(2);
  const project = makeProject(narration, true);
  project.chapters[0].steps[1] = project.chapters[0].steps[0];
  project.chapters[0].narrations[1] = project.chapters[0].narrations[0];

  const quality = assessTeachingQuality(project);
  assert.equal(quality.ok, false);
  assert.match(quality.issues.join(" "), /重复/u);
  assert.ok(quality.metrics.duplicateScreens >= 1);
  assert.ok(quality.metrics.repeatedNarrations >= 1);
});

test("quality gate rejects shallow scripts", () => {
  const quality = assessTeachingQuality(makeProject("只是一句很短的话。"));
  assert.equal(quality.ok, false);
  assert.match(quality.issues.join(" "), /口播过短/u);
  assert.throws(() => assertTeachingQuality(makeProject("只是一句很短的话。")), {
    code: "SCRIPT_QUALITY_FAILED",
    status: 422,
  });
});

test("quality gate accepts a deep teaching script", () => {
  const angles = [
    "这是一个完整例子。先说明问题为什么出现，再解释新方法减少了哪一种重复劳动。比如真实工作里，信息分散会让人反复确认，系统先把目标和条件整理出来。这个判断有边界，涉及风险和人工确认时不能自动拍板。",
    "定义不能只背名词，还要交代它和相邻概念的边界。观众要能用自己的话说出它负责什么、不负责什么。比如把回答和执行分开，才能理解为什么同一个工具会有不同角色。",
    "机制这一屏展示输入如何被识别、拆分和排序，重点是说明前一步的结果为什么会决定后一步。系统通过条件、步骤和结果连接起来，最后检查是否符合目标。",
    "当任务进入工具调用时，要展示请求、返回和可检查证据。比如查询资料后得到来源、字段和结论，观众才能知道返回值改变了什么，而不是只听到调用了工具。",
    "生活类比用厨房助手说明目标、食材、工具和试味之间的关系。它不是只会讲菜谱，而是按顺序做事、观察结果、再调整步骤，这正好对应复杂任务的运转。",
    "工作场景用活动运营举例，具体说明报名页、表单数据、提醒邮件和反馈指标如何串成连续任务。每一步都有输入、动作和证据，结果不好时才能知道从哪里修正。",
    "另一个例子放在客服分流，先识别用户问题，再查知识库，最后决定直接回复还是创建工单。三步的责任不同，不能把查到资料误认为已经解决了问题。",
    "判断结果不能靠感觉，应该回到数字、记录或产物。比如打开率、订单状态和处理记录都能成为证据，证据不足时只能标记待核对，不能直接宣布成功。",
    "反馈机制要讲清楚失败不是终点，系统会根据缺口调整下一步。但调整之前必须知道缺口来自数据还是目标本身，否则越自动越可能把错误放大。",
    "记忆能力的价值在于保存完成状态、当前阻塞和下一步，而不是简单保存一段聊天记录。只有把进度和未决问题留下来，下一次才能接着推进。",
    "权限边界要具体到发送邮件、修改页面、读取隐私数据和确认金额。规则清楚的动作可以自动做，高风险决定必须交还给人，授权和责任不能混在一起。",
    "常见误区是把能调用工具等同于能承担责任。工具只负责动作，目标、授权和最终判断仍然需要明确拥有者，出了异常还要有停机和复核位置。",
    "适用范围应该优先选择规则稳定、结果可验收和重复度高的任务。开放式判断与高风险承诺不能直接照搬相同流程，要先补充条件和人工检查。",
    "复述测试要求观众能够说出一个输入、三步过程、一个证据和一个边界。这比记住一句漂亮定义更能证明理解，也能暴露自己到底卡在概念还是机制。",
    "最后把问题、定义、机制、例子和边界重新串起来，形成可迁移的五问框架。遇到新主题时，先问它解决什么，再问怎么运转、有什么证据、什么时候不能用。",
  ];
  const project = { chapters: Array.from({ length: 5 }, (_, chapterIndex) => ({
    steps: Array.from({ length: 3 }, (_, stepIndex) => `屏幕重点 ${chapterIndex + 1}-${stepIndex + 1}`),
    narrations: angles.slice(chapterIndex * 3, chapterIndex * 3 + 3).map((text, stepIndex) => `${text} 第${chapterIndex + 1}章第${stepIndex + 1}屏的独立证据是${chapterIndex + 1}-${stepIndex + 1}，请根据这个证据继续判断。`.repeat(3)),
  })) };
  const quality = assessTeachingQuality(project);
  assert.equal(quality.ok, true);
  assert.doesNotThrow(() => assertTeachingQuality(project));
});
