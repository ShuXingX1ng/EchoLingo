import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Test 1: Check auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return NextResponse.json({
        status: "error",
        step: "auth",
        error: authError.message,
      });
    }

    if (!user) {
      return NextResponse.json({
        status: "error",
        step: "auth",
        error: "No user logged in",
      });
    }

    // Test 2: Check if sessions table exists
    const { error: tableError } = await supabase
      .from("sessions")
      .select("count")
      .limit(1);

    if (tableError) {
      return NextResponse.json({
        status: "error",
        step: "table_check",
        error: tableError.message,
        hint: "Make sure you ran supabase-schema.sql in Supabase SQL Editor",
      });
    }

    // Test 3: Try to insert a test record
    const testRecord = {
      user_id: user.id,
      mode: "test",
      messages: [],
      feedback: {},
      created_at: new Date().toISOString(),
    };

    const { data: insertData, error: insertError } = await supabase
      .from("sessions")
      .insert(testRecord)
      .select();

    if (insertError) {
      return NextResponse.json({
        status: "error",
        step: "insert_test",
        error: insertError.message,
        details: insertError,
        userId: user.id,
      });
    }

    // Clean up test record
    if (insertData && insertData[0]) {
      await supabase.from("sessions").delete().eq("id", insertData[0].id);
    }

    return NextResponse.json({
      status: "success",
      message: "Supabase connection working properly",
      userId: user.id,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      step: "unknown",
      error: String(error),
    });
  }
}
