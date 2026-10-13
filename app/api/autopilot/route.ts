import { briefFor } from '@/lib/demo-dialogue';
import { chooseNext, generateDiscussionTurn, remember, type Speech } from '@/lib/discussion';
import { discussionContext } from '@/lib/discussion-store';
import { parseResearch } from '@/lib/research';
import { parseAgendaContext } from '@/lib/agenda';
import { apiError, database, json } from '@/lib/server';
import { currentTurn, ensureCurrentSalon, generateTurn, nextAtForTurn, totalFor } from '@/lib/autopilot';
import { chinaPlan, isChinaSession } from '@/lib/salon-protocol';
import { ModelUnavailableError, type ModelUsage } from '@/lib/model-client';
import { ensureSalonArticle, pendingArticleSession } from '@/lib/article-store';
export async function POST() {
  try {
    const db=database();
    const pending=await pendingArticleSession();
    if(pending)return json(await ensureSalonArticle(pending));
    const salon=await ensureCurrentSalon(),total=totalFor(salon),turn=currentTurn(salon);
    if(!turn)return json(isChinaSession(salon)?await ensureSalonArticle(salon):{status:'complete',turn:total});
    const now=Date.now();
    if(Number(salon.next_at)>now)return json({status:'waiting',turn:salon.turn,nextAt:salon.next_at});
    const locked=await db.prepare("UPDATE sessions SET engine_state='thinking',updated=?,last_error=NULL WHERE id=? AND turn=? AND next_at<=? AND (engine_state!='thinking' OR updated<?)")
      .bind(now,salon.id,salon.turn,now,now-150000).run();
    if(!locked.meta.changes)return json({status:'thinking',turn:salon.turn,nextAt:now+12000});
    const recordUsage=(u:ModelUsage,index:number)=>db.prepare("INSERT OR IGNORE INTO usage_events (id,session,round,provider,model,input_tokens,output_tokens,cached_tokens,estimated_microusd,created) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=? AND turn=? AND updated=? AND engine_state='thinking')")
      .bind(`${salon.id}:${salon.turn}:${now}:usage:${index}`,salon.id,turn.round,u.provider,u.model,u.inputTokens,u.outputTokens,u.cachedTokens,u.estimatedMicrousd,Date.now(),salon.id,salon.turn,now);
    try {
      const rows=(await db.prepare('SELECT * FROM messages WHERE session=? ORDER BY created,id').bind(salon.id).all()).results;
      const context=await discussionContext(salon,rows);
      const plan=salon.mode==='live'?chinaPlan(context.history,context.category,Number(salon.turn)):chooseNext(context.history,context.category,Number(salon.turn));
      const question=plan?.speaker==='host'?await db.prepare("SELECT q.*,COUNT(l.id) AS votes FROM questions q LEFT JOIN likes l ON l.question=q.id WHERE q.session=? AND q.status='queued' GROUP BY q.id ORDER BY votes DESC,q.created ASC LIMIT 1").bind(salon.id).first<Record<string,unknown>>():null;
      let speech:Speech,usages:ModelUsage[]=[];
      if(salon.mode==='live') {
        const generated=await generateTurn(salon,Number(salon.turn),question,context.history,context.discussion);
        speech=generated.speech;usages=generated.usages;
      } else {
        // The deterministic demonstration remains clearly labelled and uses its legacy 14-step protocol.
        speech=generateDiscussionTurn({id:`${salon.id}:demo:${salon.turn}`,sessionId:String(salon.id),title:String(salon.title),category:context.category,history:context.history,inherited:context.inherited,position:Number(salon.turn),question:question?String(question.body):undefined,brief:briefFor(String(salon.topic_id),String(salon.title),salon.topic_context),research:parseResearch(parseAgendaContext(salon.topic_context).research)});
      }
      const next=Number(salon.turn)+1,complete=next>=total,nextAt=nextAtForTurn(next,String(salon.mode),salon);
      const snapshot=remember(String(salon.id),String(salon.title),context.category,[...context.history,speech],context.inherited);
      const writes=[
        db.prepare("INSERT OR IGNORE INTO messages (id,session,round,speaker,kind,body,meta_json,created) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id=? AND turn=? AND updated=? AND engine_state='thinking')").bind(speech.id,salon.id,speech.round,speech.speaker,speech.kind,speech.body,JSON.stringify(speech.note),Date.now(),salon.id,salon.turn,now),
        ...usages.map(recordUsage),
        db.prepare("UPDATE sessions SET discussion_json=?,turn=?,round=?,next_at=?,engine_state=?,status=?,updated=? WHERE id=? AND turn=? AND updated=? AND engine_state='thinking'").bind(JSON.stringify(snapshot),next,speech.round,nextAt,complete?'complete':'waiting',complete?'complete':'active',Date.now(),salon.id,salon.turn,now),
      ];
      if(question)writes.push(db.prepare("UPDATE questions SET status='included' WHERE id=? AND EXISTS (SELECT 1 FROM messages WHERE id=?)").bind(question.id,speech.id));
      const committed=await db.batch(writes);
      if(!committed[0].meta.changes)return json({status:'thinking',turn:salon.turn,nextAt:Date.now()+10000});
      return json({status:complete&&isChinaSession(salon)?'archiving':complete?'complete':'advanced',id:speech.id,turn:next,round:speech.round,nextAt:complete?Date.now()+1000:nextAt,modelGenerated:usages.length>0});
    } catch(error) {
      const retryAt=error instanceof ModelUnavailableError?error.retryAt:Date.now()+60000;
      const writes=error instanceof ModelUnavailableError?error.usages.map(recordUsage):[];
      writes.push(db.prepare("UPDATE sessions SET engine_state='waiting',last_error=?,next_at=?,updated=? WHERE id=? AND turn=? AND updated=? AND engine_state='thinking'").bind(error instanceof Error?error.message:'生成暂不可用',retryAt,Date.now(),salon.id,salon.turn,now));
      await db.batch(writes);
      if(error instanceof ModelUnavailableError)return json({status:'waiting',turn:salon.turn,nextAt:retryAt,reason:error.message});
      throw error;
    }
  }catch(error){return apiError(error);}
}
