import sys, os
import re
import streamlit as st
import pandas as pd
from dotenv import load_dotenv

# Load secrets from a local .env file (gitignored). See .env.example.
load_dotenv()

# --- Ensure `src/` is importable when running `streamlit run app.py` ---
# (Safest when users accidentally run from a different working directory)
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.gmail_auth import get_creds
from src.gmail_send import send_email


st.set_page_config(page_title="Quick Emailer", layout="centered")
st.title("Quick Email Sender")

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def normalize_var(name: str) -> str:
    name = name.strip()
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"[^a-zA-Z0-9_]", "", name)
    return name

def extract_placeholders(template: str) -> set[str]:
    return set(re.findall(r"{\s*([a-zA-Z_]\w*)\s*}", template))


# -------- Gmail OAuth (backend) --------
st.session_state.setdefault("creds", None)

with st.expander("Gmail Connection", expanded=True):
    if st.button("Connect Gmail"):
        try:
            st.session_state.creds = get_creds()
            st.success("Connected to Gmail! Token saved locally.")
        except Exception as e:
            st.error(f"OAuth failed: {e}")

    test_to = st.text_input("Send test email to (your email):")
    if st.button("Send test email"):
        if not st.session_state.creds:
            st.warning("Connect Gmail first.")
        elif not test_to.strip():
            st.warning("Enter a recipient email.")
        else:
            resp = send_email(
                st.session_state.creds,
                test_to.strip(),
                "Test from Quick Emailer",
                "If you received this, OAuth + Gmail API is working."
            )
            st.success(f"Sent! Message ID: {resp.get('id')}")


# -------- Tabs --------
tab_template, tab_upload, tab_write, tab_preview, tab_send = st.tabs(
    ["1) Template", "2) Upload", "3) Write", "4) Preview", "5) Send"]
)

# -------- session state for shared data --------
st.session_state.setdefault("df", None)
st.session_state.setdefault("email_col", None)
st.session_state.setdefault("subject", "Hello {name}")

# Fix: avoid referencing {group} unless user explicitly includes it
# (prevents immediate "missing columns" confusion)
st.session_state.setdefault("body", "Hi {name},\n\nThis is a test email.\n")

# For Model A dialog workflow
st.session_state.setdefault("show_confirm", False)
st.session_state.setdefault("do_send", False)


# -------- 1) TEMPLATE TAB --------
with tab_template:
    st.subheader("Download a CSV template")
    st.write("Recipient email is required. Add any extra variables you want to use in the email.")

    # Fix: include common defaults (name/time/group) so the starter experience matches typical templates
    default_vars = ["name", "time", "group"]
    extra = st.text_input("Extra variables (comma-separated)", value=", ".join(default_vars))

    vars_list: list[str] = []
    if extra.strip():
        for v in extra.split(","):
            nv = normalize_var(v)
            if nv:
                vars_list.append(nv)

    # Make unique and keep order
    seen = set()
    vars_list = [v for v in vars_list if not (v in seen or seen.add(v))]

    columns = ["email"] + vars_list
    example_row = {"email": "person@example.com"}
    for v in vars_list:
        example_row[v] = f"example_{v}"

    template_df = pd.DataFrame([example_row], columns=columns)
    csv_bytes = template_df.to_csv(index=False).encode("utf-8")

    st.download_button(
        "Download CSV Template",
        data=csv_bytes,
        file_name="quick_email.csv",
        mime="text/csv",
        use_container_width=True,
    )

    st.caption("Tip: After downloading, open it in Excel/Sheets, add rows, then upload it in the next tab.")
    st.dataframe(template_df)


# -------- 2) UPLOAD TAB --------
with tab_upload:
    st.subheader("Upload your completed CSV")

    uploaded = st.file_uploader("Upload CSV", type=["csv"])
    if uploaded:
        df = pd.read_csv(uploaded)
        st.session_state.df = df

        st.success(f"Loaded {len(df)} rows × {len(df.columns)} columns")
        st.dataframe(df.head())

        # Choose email column
        email_guess = "email" if "email" in df.columns else df.columns[0]
        st.session_state.email_col = st.selectbox(
            "Which column contains recipient emails?",
            options=list(df.columns),
            index=list(df.columns).index(email_guess),
        )

        # Basic email validation summary (re-use EMAIL_REGEX)
        emails = df[st.session_state.email_col].astype(str).fillna("").str.strip()
        invalid = [e for e in emails if not EMAIL_REGEX.match(e)]
        if invalid:
            st.warning(f"Found {len(invalid)} invalid-looking emails (showing up to 5): {invalid[:5]}")
        else:
            st.info("Email column looks good.")

        st.write("Available variables (you can use these in {braces}):")
        st.code(", ".join([f"{{{c}}}" for c in df.columns]))

    else:
        st.info("Upload a CSV to continue.")


# -------- 3) WRITE TAB --------
with tab_write:
    st.subheader("Write your email")

    df = st.session_state.df
    if df is None:
        st.info("Upload a CSV first (tab 2).")
    else:
        col1, col2 = st.columns([2, 1])
        with col1:
            st.session_state.subject = st.text_input("Subject", value=st.session_state.subject)
            st.session_state.body = st.text_area("Body", value=st.session_state.body, height=220)

        with col2:
            st.write("Insert a variable")
            var = st.selectbox("Variables", options=list(df.columns))
            if st.button("Add to body"):
                st.session_state.body += f" {{{var}}}"
            if st.button("Add to subject"):
                st.session_state.subject += f" {{{var}}}"

        needed = extract_placeholders(st.session_state.subject) | extract_placeholders(st.session_state.body)
        missing = [v for v in needed if v not in df.columns]
        if missing:
            st.error("Template uses missing columns: " + ", ".join([f"{{{m}}}" for m in missing]))
        else:
            st.success("Template variables match your CSV columns.")


# -------- 4) PREVIEW TAB --------
with tab_preview:
    st.subheader("Preview")

    df = st.session_state.df
    if df is None:
        st.info("Upload a CSV first (tab 2).")
    else:
        n = len(df)
        if n == 0:
            st.error("Your CSV has no rows.")
            st.stop()
        elif n == 1:
            i = 0
            st.info("Only 1 row in CSV — previewing row 0.")
        else:
            i = st.slider("Preview recipient row", min_value=0, max_value=n - 1, value=0)

        row = df.iloc[int(i)].to_dict()

        try:
            subject_preview = st.session_state.subject.format(**row)
            body_preview = st.session_state.body.format(**row)

            st.write("To:", row.get(st.session_state.email_col, "(email not set)"))
            st.write("Subject preview:")
            st.code(subject_preview)
            st.write("Body preview:")
            with st.container(border=True):
                st.markdown(body_preview.replace("\n", "  \n"), unsafe_allow_html=False)

        except KeyError as e:
            st.error(f"Missing column for placeholder: {e}")


# -------- 5) SEND TAB --------
with tab_send:
    st.subheader("Send")

    df = st.session_state.df
    email_col = st.session_state.email_col

    # Fix: Must have CSV
    if df is None:
        st.info("Upload a CSV first (tab 2).")
        st.stop()

    # Fix: Must have chosen an email column
    if not email_col:
        st.error("Pick the email column in the Upload tab first.")
        st.stop()

    # Fix: Must have Gmail connected
    if not st.session_state.get("creds"):
        st.warning("Connect Gmail first (use the Gmail Connection section).")
        st.stop()

    st.write(f"Ready to send to **{len(df)}** recipients.")
    st.write(f"Using email column: **{email_col}**")

    # Fix: validate emails using the shared EMAIL_REGEX
    emails = df[email_col].astype(str).fillna("").str.strip()
    invalid_mask = ~emails.apply(lambda x: bool(EMAIL_REGEX.match(x)))
    invalid_emails = df.loc[invalid_mask, email_col]

    if len(invalid_emails) > 0:
        st.error(f"Found **{len(invalid_emails)}** invalid email(s). Fix your CSV before sending.")
        st.dataframe(invalid_emails.head(10).to_frame("Invalid email"), use_container_width=True)
        st.stop()

    st.success("All emails look valid.")

    # Model A confirmation modal (st.dialog)
    @st.dialog("Confirm send")
    def confirm_send_dialog():
        st.write(f"You are about to send emails to **{len(df)}** recipients.")
        st.warning("This action cannot be undone once emails are sent.")

        st.write("First 5 recipients:")
        st.dataframe(df[[email_col]].head(5), use_container_width=True)

        c1, c2 = st.columns(2)
        with c1:
            if st.button("Cancel", use_container_width=True):
                st.session_state.show_confirm = False
                st.rerun()
        with c2:
            if st.button("Yes, send now", type="primary", use_container_width=True):
                st.session_state.show_confirm = False
                st.session_state.do_send = True
                st.rerun()

    if st.button("Send to all", type="primary", use_container_width=True):
        st.session_state.show_confirm = True

    if st.session_state.show_confirm:
        confirm_send_dialog()

    # Actual sending
    if st.session_state.do_send:
        st.session_state.do_send = False

        creds = st.session_state.creds
        total = len(df)
        progress = st.progress(0.0)
        status = st.empty()

        errors = []
        sent = 0

        for idx, row in df.iterrows():
            row_dict = row.to_dict()
            to_addr = str(row_dict.get(email_col, "")).strip()

            try:
                subject_rendered = st.session_state.subject.format(**row_dict)
                body_rendered = st.session_state.body.format(**row_dict)

                send_email(creds, to_addr, subject_rendered, body_rendered)
                sent += 1

            except Exception as e:
                errors.append({"row_index": idx, "email": to_addr, "error": str(e)})

            done = sent + len(errors)
            progress.progress(min(done / total, 1.0))
            status.write(f"Sent: **{sent}** / {total}  |  Errors: **{len(errors)}**")

        if errors:
            st.warning(f"Finished with **{len(errors)}** error(s).")
            err_df = pd.DataFrame(errors)
            st.dataframe(err_df, use_container_width=True)

            st.download_button(
                "Download error report (CSV)",
                data=err_df.to_csv(index=False).encode("utf-8"),
                file_name="send_errors.csv",
                mime="text/csv",
                use_container_width=True,
            )
        else:
            st.success(f"All done — sent **{sent}** emails successfully.")
