import pandas as pd

def is_valid_data_row(row):
    # Customize this function depending on your raw file structure
    text = row.astype(str).str.lower().str.cat(sep=' ')
    return not any(keyword in text for keyword in ["summary", "totals", "end of", "monthly", "charges"])

def clean_file(input_file, output_file):
    df = pd.read_excel(input_file, engine='xlrd')

    # Drop fully blank rows
    df.dropna(how='all', inplace=True)

    # Filter out known non-data rows
    cleaned_df = df[df.apply(is_valid_data_row, axis=1)]

    # Optional: reset index and export
    cleaned_df.reset_index(drop=True, inplace=True)
    cleaned_df.to_excel(output_file, index=False)
    print(f"✅ Cleaned data saved to: {output_file}")

if __name__ == "__main__":
    input_path = "daily trans Month.xls"
    output_path = "cleaned_stat_workbook.xlsx"
    clean_file(input_path, output_path)
